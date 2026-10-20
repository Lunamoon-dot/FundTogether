const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVNextRuntime } = require('./run-vnext-backend.cjs');

test('VNext backend runtime selects the VNext manifest and protocol identity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fundtogether-vnext-runtime-'));
  const manifestPath = path.join(directory, 'vnext-deployment.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    protocolKind: 'FUNDTOGETHER_VNEXT',
    chainId: 31339,
    rpcUrl: 'http://127.0.0.1:9548',
    campaignEscrow: '0x1111111111111111111111111111111111111111',
  }));

  const runtime = buildVNextRuntime({ DATABASE_URL: 'postgresql://fixture' }, manifestPath, '3003');

  assert.equal(runtime.FUNDTOGETHER_PROTOCOL, 'FUNDTOGETHER_VNEXT');
  assert.equal(runtime.FUNDTOGETHER_VNEXT_MANIFEST_PATH, manifestPath);
  assert.equal(runtime.FUNDTOGETHER_RPC_URL, 'http://127.0.0.1:9548');
  assert.equal(runtime.CHAIN_ID, '31339');
  assert.equal(runtime.PORT, '3003');
});
