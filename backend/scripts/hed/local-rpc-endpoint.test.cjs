const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;

test('HED startup uses the Windows localhost bridge and refreshes a verified stale manifest endpoint', () => {
  const startChain = fs.readFileSync(path.join(here, 'start-chain.ps1'), 'utf8');
  const deploy = fs.readFileSync(path.join(here, 'deploy-isolated.cjs'), 'utf8');
  assert.match(startChain, /HED_BLOCKCHAIN_RPC_URL = ['"]http:\/\/127\.0\.0\.1:9548['"]/);
  assert.match(deploy, /await verifyDeployment\(client, manifest, artifacts\.disbursement\.abi, artifacts\.token\.abi\);\s+if \(manifest\.rpcUrl !== rpcUrl\) atomicWrite\(manifestPath, \{ \.\.\.manifest, rpcUrl \}\);/);
});
