const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { parseVNextDeploymentManifest, vnextCampaignAbiHash, vnextPolicyHash } = require('../../dist/src/blockchain/vnext-deployment.js');

const hash = value => `0x${value.toString(16).padStart(64, '0')}`;
const address = value => `0x${value.toString(16).padStart(40, '0')}`;

function manifest() {
  return {
    protocolKind: 'FUNDTOGETHER_VNEXT',
    chainId: 31339,
    rpcUrl: 'http://127.0.0.1:9548',
    abiVersion: 'fundtogether-vnext-local-v1',
    abiHash: vnextCampaignAbiHash,
    policyHash: vnextPolicyHash,
    tokenDecimals: 6,
    confirmations: 1,
    campaignEscrow: address(1),
    juryRegistry: address(2),
    juryReview: address(3),
    randomnessProvider: address(4),
    tokenAddress: address(5),
    genesisHash: hash(6),
    campaignCodeHash: hash(7),
    registryCodeHash: hash(8),
    reviewCodeHash: hash(9),
    tokenCodeHash: hash(10),
    deploymentBlockNumber: '1',
    deploymentBlockHash: hash(11),
  };
}

test('VNext manifest parser accepts the frozen local identity', () => {
  assert.doesNotThrow(() => parseVNextDeploymentManifest(manifest()));
});

test('VNext manifest parser rejects a different chain or endpoint', () => {
  assert.throws(() => parseVNextDeploymentManifest({ ...manifest(), chainId: 31338 }), /31339/);
  assert.throws(() => parseVNextDeploymentManifest({ ...manifest(), rpcUrl: 'http://127.0.0.1:9547' }), /Invalid input/);
});

test('VNext manifest parser rejects duplicate contract addresses', () => {
  assert.throws(() => parseVNextDeploymentManifest({ ...manifest(), tokenAddress: address(1) }), /unique/);
});

test('VNext manifest fixture can be serialized and read without mutation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-vnext-runtime-'));
  const filename = path.join(directory, 'manifest.json');
  try {
    fs.writeFileSync(filename, JSON.stringify(manifest()));
    assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), manifest());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
