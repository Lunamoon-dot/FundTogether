import { zeroHash } from 'viem';
import { CampaignSubmissionService } from './campaign-submission.service';

describe('CampaignSubmissionService confirmed synchronization', () => {
  const address = `0x${'1'.repeat(40)}`;
  const hash = `0x${'2'.repeat(64)}`;
  const plan = { chainId: 31337, contractAddress: address, tokenAddress: address, organizer: address, confirmations: 1,
    title: 'Campaign', goalUnits: '10', bondUnits: '10', fundingDeadline: 1900000000, budgetUnits: ['10'], criteriaHashes: [hash] };
  let service: CampaignSubmissionService;
  let update: jest.Mock;
  let client: { getBlockNumber: jest.Mock; getBlock: jest.Mock; readContract: jest.Mock };
  beforeEach(() => {
    const values: Record<string, unknown> = {
      campaignForDraft: 2n, campaigns: ['Campaign', address, 10n, 10n, address, true, 10n, 0n],
      fundingDeadlines: 1900000000n, milestoneCount: 1n, campaignState: 0, milestones: [10n, 0], milestoneCriteria: hash,
    };
    update = jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) });
    client = {
      getBlockNumber: jest.fn().mockResolvedValue(10n), getBlock: jest.fn().mockResolvedValue({ number: 10n, hash }),
      readContract: jest.fn().mockImplementation(async ({ functionName }: { functionName: string }) => values[functionName]),
    };
    service = new CampaignSubmissionService({ update } as never, {} as never, { client, verifyDeployment: jest.fn() } as never);
    jest.spyOn(service, 'get').mockResolvedValue(plan as never);
  });
  it('only reports awaiting review after matched criteria and the full bond', async () => {
    await expect(service.sync('campaign', 'organizer')).resolves.toMatchObject({ stage: 'bond_locked', bondLocked: true, criteriaReady: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(client.readContract.mock.calls.every(([options]) => options.blockNumber === 10n)).toBe(true);
  });
  it('does not report an unbonded campaign as submitted', async () => {
    const original = client.readContract.getMockImplementation()!;
    client.readContract.mockImplementation(options => options.functionName === 'campaigns'
      ? ['Campaign', address, 10n, 10n, address, false, 0n, 0n] : original(options));
    await expect(service.sync('campaign', 'organizer')).resolves.toMatchObject({ stage: 'criteria_ready', bondLocked: false });
  });
  it('missing criteria remain incomplete even if a bond is locked', async () => {
    const original = client.readContract.getMockImplementation()!;
    client.readContract.mockImplementation(options => options.functionName === 'milestoneCriteria' ? zeroHash : original(options));
    await expect(service.sync('campaign', 'organizer')).resolves.toMatchObject({ stage: 'created', criteriaReady: false });
  });
  it('reorg during reads prevents any database update', async () => {
    client.getBlock.mockResolvedValueOnce({ hash }).mockResolvedValueOnce({ hash: zeroHash });
    await expect(service.sync('campaign', 'organizer')).rejects.toThrow('Block changed');
    expect(update).not.toHaveBeenCalled();
  });
  it('reorg also invalidates an absent draft mapping', async () => {
    client.readContract.mockResolvedValue(0n);
    client.getBlock.mockResolvedValueOnce({ hash }).mockResolvedValueOnce({ hash: zeroHash });
    await expect(service.sync('campaign', 'organizer')).rejects.toThrow('Block changed');
    expect(update).not.toHaveBeenCalled();
  });
  it('an absent mapping returns prepared without writing success', async () => {
    client.readContract.mockResolvedValue(0n);
    await expect(service.sync('campaign', 'organizer')).resolves.toMatchObject({ stage: 'prepared', onchainCampaignId: null });
    expect(update).not.toHaveBeenCalled();
  });
  it('mismatched frozen criteria fail without updating status', async () => {
    const original = client.readContract.getMockImplementation()!;
    client.readContract.mockImplementation(options => options.functionName === 'milestoneCriteria' ? `0x${'3'.repeat(64)}` : original(options));
    await expect(service.sync('campaign', 'organizer')).rejects.toThrow('criteria differ');
    expect(update).not.toHaveBeenCalled();
  });
});
