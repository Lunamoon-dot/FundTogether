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
    if not active.exists() and backup.exists():
        snapshots.inspect_state(backup)
        snapshots.promote_snapshot(backup, active)
    if active.exists():
        snapshots.inspect_state(active)
    elif manifest.exists() or backup.with_suffix('.json.previous').exists():
        raise ValueError('Reward saved chain missing; refusing empty replacement')
    pending = active.with_suffix('.json.pending')
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
        while process.poll() is None:
            time.sleep(2)
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
