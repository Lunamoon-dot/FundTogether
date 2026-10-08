import { keccak256, stringToHex, zeroHash } from 'viem';
import { BlockchainService, criteriaReady, matchesSubmission } from './blockchain.service';
import { deploymentAnchorMatches } from './blockchain.constants';
import type { CampaignSnapshot } from './blockchain.service';
import type { SubmissionPlan } from '../modules/campaigns/submission-plan';

const hash = keccak256(stringToHex('criterion'));
const plan: SubmissionPlan = {
  chainId: 31337, contractAddress: '0x0000000000000000000000000000000000000001',
  tokenAddress: '0x00000000000000000000000000000000000000ab',
  organizer: '0x00000000000000000000000000000000000000cd',
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, confirmations: 1,
  draftKey: hash, title: 'Water', fundingDeadline: 1800000000,
  budgetUnits: ['9007199254740993', '2'], criteriaHashes: [hash, hash],
  goalUnits: '9007199254740995', bondUnits: '9007199254740993',
};
const snapshot: CampaignSnapshot = {
  name: plan.title, token: plan.tokenAddress, organizer: plan.organizer,
  goalUnits: plan.goalUnits, requiredBondUnits: plan.bondUnits,
  bondAmountUnits: plan.bondUnits, bondLocked: true, totalContributedUnits: '0',
  fundingDeadline: String(plan.fundingDeadline), chainState: 0,
  milestones: plan.budgetUnits.map(budgetUnits => ({ budgetUnits, criteriaHash: hash })),
  published: false, publicationTransactionHash: null, indexedBlock: '42',
};

describe('Campaign projection matching', () => {
  it('matches exact integer strings beyond Number precision', () => {
    expect(matchesSubmission(plan, snapshot)).toBe(true);
    expect(criteriaReady(plan, snapshot)).toBe(true);
  });

  it.each([
    { name: 'Different' },
    { token: plan.contractAddress },
    { organizer: plan.contractAddress },
    { goalUnits: '9007199254740994' },
    { requiredBondUnits: '9007199254740992' },
    { fundingDeadline: '1800000001' },
    { milestones: snapshot.milestones.slice(0, 1) },
    { milestones: [...snapshot.milestones].reverse() },
    { milestones: [{ budgetUnits: plan.budgetUnits[0], criteriaHash: zeroHash }, { budgetUnits: '3', criteriaHash: hash }] },
    { milestones: [{ budgetUnits: plan.budgetUnits[0], criteriaHash: keccak256(stringToHex('other')) }, snapshot.milestones[1]] },
  ])('rejects a changed commitment: %j', change => {
    expect(matchesSubmission(plan, { ...snapshot, ...change } as CampaignSnapshot)).toBe(false);
  });

  it('allows unset criteria for association but never for review/public display', () => {
    const incomplete = { ...snapshot, milestones: snapshot.milestones.map(m => ({ ...m, criteriaHash: zeroHash })) };
    expect(matchesSubmission(plan, incomplete)).toBe(true);
    expect(criteriaReady(plan, incomplete)).toBe(false);
  });

  it('compares EVM addresses without case sensitivity', () => {
    expect(matchesSubmission(plan, { ...snapshot, token: '0x00000000000000000000000000000000000000AB' })).toBe(true);
  });
});

describe('Deployment reset identity', () => {
  const anchor = `0x${'3'.repeat(64)}`;
  const changed = `0x${'4'.repeat(64)}`;
  const deployment = { ...plan, rpcUrl: 'http://127.0.0.1:9545', tokenDecimals: 6, resolver: plan.organizer,
    contractCodeHash: keccak256('0x01'), tokenCodeHash: keccak256('0x01'),
    deploymentBlockNumber: '2', deploymentBlockHash: anchor };
  function setup(extra: Partial<typeof deployment> & { milestonePolicy?: string; recoveryPolicy?: string; deploymentId?: string } = {}) {
    const service = new BlockchainService({ ...deployment, ...extra });
    Object.assign(service.client, { getChainId: jest.fn().mockResolvedValue(31337),
      getCode: jest.fn().mockResolvedValue('0x01'),
      getBlock: jest.fn().mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({ hash: blockNumber === 0n ? plan.genesisHash : anchor })) });
    jest.spyOn(service, 'read').mockResolvedValue(plan.tokenAddress);
    return service;
  }
  it('accepts the configured mined anchor', async () => {
    await expect(setup().verifyDeployment()).resolves.toBeUndefined();
  });
  it('rejects a reused address/code/genesis with a changed deployment block', async () => {
    const service = setup();
    Object.assign(service.client, { getBlock: jest.fn().mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) => ({ hash: blockNumber === 0n ? plan.genesisHash : changed })) });
    await expect(service.verifyDeployment()).rejects.toThrow('deployment identity changed');
  });
  it('cannot adopt a legacy or differently anchored submission into the new incarnation', async () => {
    const service = setup();
    await expect(service.verifyDeployment({ ...deployment, deploymentBlockHash: undefined, deploymentBlockNumber: undefined })).rejects.toThrow('deployment identity changed');
    await expect(service.verifyDeployment({ ...deployment, deploymentBlockHash: changed })).rejects.toThrow('deployment identity changed');
  });
  it('requires the complete block-number/hash pair', async () => {
    const service = new BlockchainService({ ...deployment, deploymentBlockHash: undefined });
    await expect(service.verifyDeployment()).rejects.toThrow('deployment identity changed');
  });
  it('preserves legacy identity but never equates legacy with anchored identity', () => {
    expect(deploymentAnchorMatches({}, {})).toBe(true);
    expect(deploymentAnchorMatches(plan, deployment)).toBe(false);
    expect(deploymentAnchorMatches(deployment, { ...deployment })).toBe(true);
  });
  const markers = { milestonePolicy: hash, recoveryPolicy: anchor, deploymentId: changed };
  function mvp() {
    const service = setup(markers);
    jest.mocked(service.read).mockImplementation(async name => ({ supportedToken: plan.tokenAddress,
      MILESTONE_POLICY: markers.milestonePolicy, RECOVERY_POLICY: markers.recoveryPolicy, deploymentId: markers.deploymentId })[name]);
    return service;
  }
  it('verifies the on-chain MVP policies and deployment instance', async () => {
    await expect(mvp().verifyDeployment()).resolves.toBeUndefined();
  });
  it.each(['MILESTONE_POLICY', 'RECOVERY_POLICY', 'deploymentId'])('rejects a changed MVP marker: %s', async name => {
    const service = mvp();
    jest.mocked(service.read).mockImplementation(async key => key === name ? zeroHash : ({ supportedToken: plan.tokenAddress,
      MILESTONE_POLICY: markers.milestonePolicy, RECOVERY_POLICY: markers.recoveryPolicy, deploymentId: markers.deploymentId })[key]);
    await expect(service.verifyDeployment()).rejects.toThrow('deployment identity changed');
  });
  it('rejects a partial capability rather than treating it as a safe MVP deployment', async () => {
    await expect(setup({ milestonePolicy: hash }).verifyDeployment()).rejects.toThrow('deployment identity changed');
  });
  it('fails closed on a policy RPC outage', async () => {
    const service = mvp(); jest.spyOn(service, 'read').mockRejectedValue(new Error('RPC unavailable'));
    await expect(service.verifyDeployment()).rejects.toThrow('deployment identity changed');
  });
});
