"""Own one disposable loopback Anvil fork; EOF closes only this child."""
import pathlib
import subprocess
import sys

anvil = pathlib.Path.home() / '.foundry/bin/anvil'
args = [str(anvil), '--host', '127.0.0.1', '--port', '9548', '--chain-id', '31338', '--silent', '--preserve-historical-states']
if len(sys.argv) > 1:
    restored = pathlib.Path(sys.argv[1]).resolve()
    allowed = pathlib.Path(__file__).resolve().parents[3] / '.local/workflow-b/recovery'
    if not restored.is_relative_to(allowed.resolve()) or restored.suffix != '.json':
        raise ValueError('Restore only a lab snapshot under .local/workflow-b/recovery')
    args += ['--load-state', str(restored)]
else:
    args += ['--fork-url', 'http://127.0.0.1:9547']
child = subprocess.Popen(args, stdout=sys.stderr, stderr=sys.stderr)
try:
    print(child.pid, flush=True)
    sys.stdin.buffer.read()
finally:
    child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
