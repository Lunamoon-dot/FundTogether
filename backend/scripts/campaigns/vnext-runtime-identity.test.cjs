const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { keccak256, toHex } = require('viem');
const {
  parseVNextDeploymentManifest,
  verifyVNextDeployment,
  vnextCampaignAbiHash,
  vnextPolicyHash,
} = require('../../dist/src/blockchain/vnext-deployment.js');

const root = path.resolve(__dirname, '../../..');

function loadPolicyRegistry() {
  const source = fs.readFileSync(path.join(root, 'docs/protocol/parameters-v2-remediation.md'), 'utf8');
  const match = source.match(/<!-- vnext-policy-json\s*([\s\S]*?)\s*-->/);
  if (!match) throw new Error('VNext remediation policy JSON block is missing');
  return JSON.parse(match[1]);
}

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

function deployedFixture() {
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
  return { verified, code };
}

function verifierClient(verified, code, overrides = {}) {
  const campaignReads = {
    supportedToken: verified.tokenAddress,
    reviewEngine: verified.juryReview,
    protocolVersion: 1n,
    policyHash: verified.policyHash,
    milestoneSubmissionWindow: 7n * 24n * 60n * 60n,
    correctionWindow: 7n * 24n * 60n * 60n,
    challengeWindowDuration: 7n * 24n * 60n * 60n,
    MAX_MILESTONE_CORRECTIONS: 1n,
  };
  const reviewReads = {
    registry: verified.juryRegistry,
    campaignEscrow: verified.campaignEscrow,
    randomnessProvider: verified.randomnessProvider,
    protocolVersion: 1n,
    enrollmentDuration: 48n * 60n * 60n,
    commitDuration: 24n * 60n * 60n,
    revealDuration: 24n * 60n * 60n,
    appealWindowDuration: 48n * 60n * 60n,
    randomnessTimeout: 48n * 60n * 60n,
    maxEligibleJudges: 300n,
    MINIMUM_STAKE_FLOOR: 10_000_000n,
    RISK_MULTIPLIER_BPS: 500n,
    appealBond: 1_000_000n,
    maximumAppealRounds: 2n,
    MAXIMUM_RETRIES_PER_REVIEW_LEVEL: 2n,
    minoritySlashBps: 500n,
  };
  const read = (addressValue, functionName) => {
    const key = `${addressValue.toLowerCase()}:${functionName}`;
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
    if (addressValue === verified.campaignEscrow) return campaignReads[functionName];
    if (addressValue === verified.juryReview) return reviewReads[functionName];
    return 6;
  };
  return {
    getChainId: async () => 31339,
    getBlock: async ({ blockNumber }) => ({
      hash: blockNumber === 0n ? verified.genesisHash : verified.deploymentBlockHash,
    }),
    getCode: async ({ address: addressValue }) => code[addressValue],
    readContract: async ({ address: addressValue, functionName }) => read(addressValue, functionName),
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

test('VNext runtime identity matches the remediation policy registry', () => {
  const policy = loadPolicyRegistry();
  assert.deepEqual({
    policyVersion: policy.policyVersion,
    chainId: policy.chainId,
    tokenDecimals: policy.tokenDecimals,
    milestoneSubmissionWindowSeconds: policy.milestoneSubmissionWindowSeconds,
    correctionWindowSeconds: policy.correctionWindowSeconds,
    challengeWindowSeconds: policy.challengeWindowSeconds,
    judgeEnrollmentWindowSeconds: policy.judgeEnrollmentWindowSeconds,
    commitWindowSeconds: policy.commitWindowSeconds,
    revealWindowSeconds: policy.revealWindowSeconds,
    appealWindowSeconds: policy.appealWindowSeconds,
    randomnessTimeoutSeconds: policy.randomnessTimeoutSeconds,
    maxEligibleJudges: policy.maxEligibleJudges,
    maximumAppealRounds: policy.maximumAppealRounds,
    maximumRetriesPerReviewLevel: policy.maximumRetriesPerReviewLevel,
    maximumMilestoneCorrections: policy.maximumMilestoneCorrections,
    minoritySlashBps: policy.minoritySlashBps,
    appealBondUnits: policy.appealBondUnits,
    minimumStakeFloorUnits: policy.minimumStakeFloorUnits,
    riskMultiplierBps: policy.riskMultiplierBps,
  }, {
    policyVersion: 'fundtogether-vnext-local-v2-remediation',
    chainId: 31339,
    tokenDecimals: 6,
    milestoneSubmissionWindowSeconds: 7 * 24 * 60 * 60,
    correctionWindowSeconds: 7 * 24 * 60 * 60,
    challengeWindowSeconds: 7 * 24 * 60 * 60,
    judgeEnrollmentWindowSeconds: 48 * 60 * 60,
    commitWindowSeconds: 24 * 60 * 60,
    revealWindowSeconds: 24 * 60 * 60,
    appealWindowSeconds: 48 * 60 * 60,
    randomnessTimeoutSeconds: 48 * 60 * 60,
    maxEligibleJudges: 300,
    maximumAppealRounds: 2,
    maximumRetriesPerReviewLevel: 2,
    maximumMilestoneCorrections: 1,
    minoritySlashBps: 500,
    appealBondUnits: '1000000',
    minimumStakeFloorUnits: '10000000',
    riskMultiplierBps: 500,
  });
  assert.equal(vnextPolicyHash, keccak256(toHex(policy.policyVersion)));
});

test('VNext verifier enforces remediation policy values and contract wiring', async () => {
  const { verified, code } = deployedFixture();
  const client = verifierClient(verified, code);

  await verifyVNextDeployment(client, parseVNextDeploymentManifest(verified));
});

test('VNext verifier rejects a campaign policy window mismatch', async () => {
  const { verified, code } = deployedFixture();
  const overrideKey = `${verified.campaignEscrow}:challengeWindowDuration`;
  const client = verifierClient(verified, code, { [overrideKey]: 6n * 24n * 60n * 60n });

  await assert.rejects(
    verifyVNextDeployment(client, parseVNextDeploymentManifest(verified)),
    /VNext campaign policy mismatch/,
  );
});

test('VNext verifier rejects a review policy parameter mismatch', async () => {
  const { verified, code } = deployedFixture();
  const overrideKey = `${verified.juryReview}:appealBond`;
  const client = verifierClient(verified, code, { [overrideKey]: 2_000_000n });

  await assert.rejects(
    verifyVNextDeployment(client, parseVNextDeploymentManifest(verified)),
    /VNext review policy mismatch/,
  );
});
