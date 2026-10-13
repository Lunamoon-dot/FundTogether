"""Run a Reward-only Anvil snapshot supervisor without replacing another chain."""
import fcntl
import importlib.util
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location('snapshot_validation', Path(__file__).resolve().parents[1] / 'anvil_state.py')
snapshots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshots)


def prepare_state(active, backup, manifest):
    active.parent.mkdir(parents=True, exist_ok=True)
    backup.parent.mkdir(parents=True, exist_ok=True)
    pending = active.with_suffix('.json.pending')
    if not active.exists():
        if backup.exists():
            snapshots.promote_snapshot(backup, active)
        elif pending.exists():
            snapshots.promote_snapshot(pending, active)
    if active.exists():
        result = snapshots.inspect_state(active)
        if not backup.exists():
            snapshots.promote_snapshot(active, backup)
        return result
    if manifest.exists() or backup.with_suffix('.json.previous').exists():
        raise ValueError('Reward saved chain missing; refusing empty replacement')
    return None


def run(active, backup, manifest, pid_file):
    root = Path(__file__).resolve().parents[3]
    expected = Path.home() / '.local/state/fundtogether/reward/anvil/state.json'
    if (active.resolve() != expected.resolve()
            or backup.resolve() != (root / '.local/reward/anvil/state.json').resolve()
            or manifest.resolve() != (root / '.local/reward/generated/deployment.local.json').resolve()
            or pid_file.resolve() != (root / '.local/reward/anvil/supervisor.pid').resolve()):
        raise ValueError('Reward state path invalid')
    active.parent.mkdir(parents=True, exist_ok=True)
    backup.parent.mkdir(parents=True, exist_ok=True)
    lock = active.with_suffix('.json.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    prepare_state(active, backup, manifest)
    pending = active.with_suffix('.json.pending')
    before = pending.stat() if pending.exists() else None
    attempted = (before.st_mtime_ns, before.st_size) if before else None
    args = [str(Path.home() / '.foundry/bin/anvil'), '--host', '0.0.0.0', '--port', '9548', '--chain-id', '31339',
            '--dump-state', str(pending), '--state-interval', '30', '--preserve-historical-states', '--quiet']
    if active.exists():
        args += ['--load-state', str(active)]
    process = subprocess.Popen(args, start_new_session=True)
    pid_file.write_text(str(os.getpid()), encoding='utf-8')

    def stop(_signal, _frame):
        if process.poll() is None:
            process.send_signal(signal.SIGINT)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        observed = None
        while process.poll() is None:
            time.sleep(2)
            if not pending.exists():
                continue
            stat = pending.stat()
            signature = (stat.st_mtime_ns, stat.st_size)
            if signature == observed and signature != attempted:
                attempted = signature
                try:
                    saved = snapshots.promote_snapshot(pending, active)
                    snapshots.promote_snapshot(active, backup)
                    print(f"Validated Reward snapshot: block {saved['best_block_number']}", flush=True)
                except (ValueError, OSError) as error:
                    print(f'Reward snapshot not promoted; last good state retained: {error}', file=sys.stderr, flush=True)
            observed = signature
        if process.wait() == 0:
            snapshots.promote_snapshot(pending, active)
            snapshots.promote_snapshot(active, backup)
        return process.returncode
    finally:
        pid_file.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        sys.exit(run(*(Path(arg) for arg in sys.argv[1:5])))
    except (ValueError, OSError) as error:
        print(f'Reward state error: {error}; saved state preserved', file=sys.stderr)
        sys.exit(1)
