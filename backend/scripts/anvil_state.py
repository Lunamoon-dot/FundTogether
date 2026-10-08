"""Run local Anvil with validated, atomic snapshots on the native Linux filesystem."""
import fcntl
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


class JsonStream:
    # Decode one history entry at a time; full snapshots can exceed 600 MB.
    def __init__(self, source, chunk_size=1024 * 1024):
        self.source, self.chunk_size = source, chunk_size
        self.buffer = ''
        self.eof = False
        self.decoder = json.JSONDecoder()

    def fill(self):
        chunk = self.source.read(self.chunk_size)
        self.buffer += chunk
        self.eof = not chunk

    def peek(self):
        self.buffer = self.buffer.lstrip()
        while not self.buffer and not self.eof:
            self.fill()
            self.buffer = self.buffer.lstrip()
        return self.buffer[:1]

    def expect(self, token):
        if self.peek() != token:
            raise ValueError('Incomplete or invalid snapshot JSON')
        self.buffer = self.buffer[1:]

    def value(self):
        self.peek()
        while True:
            try:
                value, end = self.decoder.raw_decode(self.buffer)
                # A number may continue in the next chunk.
                if end == len(self.buffer) and not self.eof:
                    self.fill()
                    continue
                self.buffer = self.buffer[end:]
                return value
            except json.JSONDecodeError as error:
                if self.eof:
                    raise ValueError('Incomplete or invalid snapshot JSON') from error
                self.fill()


def inspect_state(path, chunk_size=1024 * 1024):
    fields = {}
    with open(path, encoding='utf-8') as source:
        reader = JsonStream(source, chunk_size)
        reader.expect('{')
        while reader.peek() != '}':
            key = reader.value()
            if not isinstance(key, str) or key in fields:
                raise ValueError('Invalid snapshot field')
            reader.expect(':')
            if key == 'historical_states':
                reader.expect('[')
                count = 0
                while reader.peek() != ']':
                    entry = reader.value()
                    if not isinstance(entry, list) or len(entry) != 2:
                        raise ValueError('Invalid historical state')
                    count += 1
                    if reader.peek() == ']':
                        break
                    reader.expect(',')
                    if reader.peek() == ']':
                        raise ValueError('Trailing comma')
                reader.expect(']')
                fields[key] = count
            else:
                fields[key] = reader.value()
            if reader.peek() == '}':
                break
            reader.expect(',')
            if reader.peek() == '}':
                raise ValueError('Trailing comma')
        reader.expect('}')
        if reader.peek():
            raise ValueError('Trailing data in snapshot')
    if not all(key in fields for key in ('block', 'accounts', 'best_block_number', 'blocks', 'transactions')):
        raise ValueError('Missing Anvil snapshot fields')
    if not isinstance(fields['accounts'], dict) or not isinstance(fields['blocks'], list) or not fields['blocks']:
        raise ValueError('Invalid Anvil state')
    if not isinstance(fields['transactions'], list) or not isinstance(fields['best_block_number'], int):
        raise ValueError('Invalid Anvil transactions or head')
    block = fields['block']
    if not isinstance(block, dict) or not isinstance(block.get('number'), str):
        raise ValueError('Invalid Anvil block')
    if int(block['number'], 16) != fields['best_block_number']:
        raise ValueError('Snapshot head mismatch')
    return {'best_block_number': fields['best_block_number'],
            'transactions': len(fields['transactions']),
            'historical_states': fields.get('historical_states', 0)}


def sync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def promote_snapshot(pending, active):
    candidate = active.with_suffix('.json.validating')
    try:
        # Validate an independent copy so concurrent Anvil writes cannot mutate it.
        before = pending.stat()
        shutil.copyfile(pending, candidate)
        after = pending.stat()
        if (before.st_mtime_ns, before.st_size, before.st_ino) != (after.st_mtime_ns, after.st_size, after.st_ino):
            raise ValueError('Snapshot changed while copying; retry after the next write')
        result = inspect_state(candidate)
        if active.exists():
            if result['best_block_number'] < inspect_state(active)['best_block_number']:
                raise ValueError('Refusing an older snapshot')
        with candidate.open('rb') as source:
            os.fsync(source.fileno())
        if active.exists():
            previous = active.with_suffix('.json.previous')
            staging = active.with_suffix('.json.previous.tmp')
            staging.unlink(missing_ok=True)
            os.link(active, staging)
            os.replace(staging, previous)
            sync_directory(active.parent)
        os.replace(candidate, active)
        sync_directory(active.parent)
        return result
    finally:
        candidate.unlink(missing_ok=True)


def run(active):
    active.parent.mkdir(parents=True, exist_ok=True)
    lock = active.with_suffix('.json.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if not active.exists():
        raise ValueError('Saved chain missing. Refusing to create an empty replacement chain.')
    inspect_state(active)
    pending = active.with_suffix('.json.pending')
    before = pending.stat() if pending.exists() else None
    attempted = (before.st_mtime_ns, before.st_size) if before else None
    process = subprocess.Popen([
        str(Path.home() / '.foundry/bin/anvil'), '--host', '0.0.0.0', '--port', '8545',
        '--chain-id', '31337', '--block-time', '5', '--mixed-mining',
        '--load-state', str(active), '--dump-state', str(pending),
        '--state-interval', '60', '--preserve-historical-states', '--quiet',
    ], start_new_session=True)
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        if not stopping and process.poll() is None:
            stopping = True
            process.send_signal(signal.SIGINT)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
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
                saved = promote_snapshot(pending, active)
                print(f"Validated snapshot: block {saved['best_block_number']}", flush=True)
            except (ValueError, OSError) as error:
                print(f'Snapshot not promoted; last good state retained: {error}', file=sys.stderr, flush=True)
        observed = signature
    code = process.wait()
    if code != 0:
        return code
    promote_snapshot(pending, active)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(run(Path(sys.argv[1])))
    except (ValueError, OSError) as error:
        print(f'Anvil state error: {error}. Saved state was not replaced.', file=sys.stderr)
        sys.exit(1)
