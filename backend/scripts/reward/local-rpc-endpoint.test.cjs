const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Reward chain startup preserves an occupied listener unless its manifest verifies', () => {
  const here = __dirname;
  assert.match(fs.readFileSync(path.join(here, 'start-chain.ps1'), 'utf8'), /REWARD_RPC_URL = ['"]http:\/\/127\.0\.0\.1:9548['"]/);
  assert.match(fs.readFileSync(path.join(here, 'start-chain.ps1'), 'utf8'), /listener identity failed; it was not stopped or reset/);
  assert.match(fs.readFileSync(path.join(here, 'deploy-isolated.cjs'), 'utf8'), /--verify-only/);
});
