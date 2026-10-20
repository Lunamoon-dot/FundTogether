const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { keccak256 } = require('viem');
const {
  parseVNextDeploymentManifest,
  verifyVNextDeployment,
  vnextCampaignAbiHash,
  vnextPolicyHash,
} = require('../../dist/src/blockchain/vnext-deployment.js');

const hash = value => `0x${value.toString(16).padStart(64, '0')}`;
const address = value => `0x${value.toString(16).padStart(40, '0')}`;

function manifest() {
  return {
    protocolKind: 'FUNDTOGETHER_VNEXT',
    chainId: 31339,
    rpcUrl: 'http://127.0.0.1:9548',
    abiVersion: 'fundtogether-vnext-local-v2-remediation',
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

test('VNext verifier enforces remediation policy values and contract wiring', async () => {
  const current = manifest();
  const code = {
    [current.campaignEscrow]: '0x6000',
    [current.juryRegistry]: '0x6001',
    [current.juryReview]: '0x6002',
    [current.randomnessProvider]: '0x6003',
    [current.tokenAddress]: '0x6004',
  };
  const verified = {
    ...current,
    campaignCodeHash: keccak256(code[current.campaignEscrow]),
    registryCodeHash: keccak256(code[current.juryRegistry]),
    reviewCodeHash: keccak256(code[current.juryReview]),
    tokenCodeHash: keccak256(code[current.tokenAddress]),
  };
  const client = {
    getChainId: async () => 31339,
    getBlock: async ({ blockNumber }) => ({
      hash: blockNumber === 0n ? verified.genesisHash : verified.deploymentBlockHash,
    }),
    getCode: async ({ address }) => code[address],
    readContract: async ({ address, functionName }) => {
      if (address === verified.campaignEscrow) {
        return {
          supportedToken: verified.tokenAddress,
          reviewEngine: verified.juryReview,
          protocolVersion: 1n,
          policyHash: verified.policyHash,
          milestoneSubmissionWindow: 7n * 24n * 60n * 60n,
          correctionWindow: 7n * 24n * 60n * 60n,
        }[functionName];
      }
      if (address === verified.juryReview) {
        return {
          registry: verified.juryRegistry,
          campaignEscrow: verified.campaignEscrow,
          protocolVersion: 1n,
          MINIMUM_STAKE_FLOOR: 10_000_000n,
          RISK_MULTIPLIER_BPS: 500n,
        }[functionName];
      }
      return 6;
    },
  };

  await verifyVNextDeployment(client, parseVNextDeploymentManifest(verified));
});
