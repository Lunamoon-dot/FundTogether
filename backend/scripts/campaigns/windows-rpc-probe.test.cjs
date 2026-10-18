const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('quiet CLI probe returns failure without stderr during startup retries', () => {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'windows-rpc-probe.cjs'),
    'http://127.0.0.1:1',
    '--quiet',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
});
