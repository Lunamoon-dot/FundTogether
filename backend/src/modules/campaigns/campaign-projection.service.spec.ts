import { CampaignProjectionService } from './campaign-projection.service';
import type { IndexerStatus } from '../../indexer/indexer.service';
import { MVP_MILESTONE_POLICY } from '../../blockchain/blockchain.constants';

describe('Public campaign workflow checkpoint', () => {
  const hash = `0x${'1'.repeat(64)}`;
  const sync: IndexerStatus = { status: 'ready', lastIndexedBlock: '15', lastIndexedBlockHash: hash, headBlock: '15', error: null };
  let chain: { deployment: { milestonePolicy?: string }; client: { getBlock: jest.Mock }; read: jest.Mock };
  let activations: { args: { campaignId: string; milestoneIndex: string }; blockNumber: string; transactionHash: string }[];
  let workflow: (id: string, state: string, checkpoint: IndexerStatus) => Promise<Record<string, unknown>>;
  beforeEach(() => {
    const values: Record<string, unknown> = { campaignState: 3, currentMilestoneIndex: 0n, activationDeadlines: 110n,
      refundSnapshotted: false, refundPool: 0n, totalReleased: 0n, evidenceDeadlines: 0n,
      submissionVersion: 0n, milestoneEvidence: [hash, 0n], admissionDeadlines: 0n };
    chain = { deployment: {}, client: { getBlock: jest.fn().mockResolvedValue({ hash, timestamp: 100n }) },
      read: jest.fn(async (name: string) => values[name]) };
    activations = [{ args: { campaignId: '0', milestoneIndex: '0' }, blockNumber: '15', transactionHash: hash }];
    const database = { select: () => ({ from: () => ({ where: async () => activations }) }) };
    const service = new CampaignProjectionService(database as never, chain as never, { streamKey: 'test' } as never, {} as never);
    workflow = (service as unknown as { workflow: typeof workflow }).workflow.bind(service);
  });
  it('reads public chain facts at one indexed block, including campaign ID zero', async () => {
    const result = await workflow('0', 'FUNDED', sync);
    expect(result).toMatchObject({ chainTimestamp: '100', checkedBlock: '15', currentMilestoneIndex: '0', activationDeadline: '110', refundPoolUnits: '0' });
    expect(result.activationTransactionHash).toBe(hash);
    expect(chain.read.mock.calls.every(call => call[2] === 15n)).toBe(true);
    expect(chain.client.getBlock).toHaveBeenCalledWith({ blockNumber: 15n });
    expect(chain.read).not.toHaveBeenCalledWith('admissionDeadlines', expect.anything(), expect.anything());
  });
  it('reads the active submission admission deadline at the same block', async () => {
    const original = chain.read.getMockImplementation()!;
    chain.read.mockImplementation((name, ...args) => name === 'submissionVersion' ? 2n : name === 'admissionDeadlines' ? 120n : original(name, ...args));
    expect((await workflow('0', 'FUNDED', sync)).admissionDeadline).toBe('120');
    expect(chain.read).toHaveBeenCalledWith('admissionDeadlines', [0n, 0n, 2n], 15n);
  });
  it('reads MVP case deadlines and resolver at the same canonical checkpoint', async () => {
    chain.deployment.milestonePolicy = MVP_MILESTONE_POLICY;
    const original = chain.read.getMockImplementation()!;
    chain.read.mockImplementation((name, ...args) => name === 'challengeCases'
      ? [0, hash, hash, hash, 130n, 140n]
      : name === 'resolver' ? '0x1234567890123456789012345678901234567890' : original(name, ...args));
    expect(await workflow('0', 'FUNDED', sync)).toMatchObject({ milestoneMvp: true,
      caseDeadlines: { responseDeadline: '130', resolutionDeadline: '140', resolver: '0x1234567890123456789012345678901234567890' } });
    expect(chain.read).toHaveBeenCalledWith('challengeCases', [0n, 0n, 0n], 15n);
    expect(chain.read.mock.calls.every(call => call[2] === 15n)).toBe(true);
  });
  it('does not attribute another campaign, milestone or future activation to this checkpoint', async () => {
    activations = [
      { args: { campaignId: '1', milestoneIndex: '0' }, blockNumber: '15', transactionHash: hash },
      { args: { campaignId: '0', milestoneIndex: '1' }, blockNumber: '15', transactionHash: hash },
      { args: { campaignId: '0', milestoneIndex: '0' }, blockNumber: '16', transactionHash: hash },
    ];
    expect((await workflow('0', 'FUNDED', sync)).activationTransactionHash).toBeNull();
  });
  it('rejects a missing checkpoint rather than inventing a chain clock', async () => {
    await expect(workflow('0', 'FUNDED', { ...sync, lastIndexedBlock: null })).rejects.toThrow('checkpoint');
    expect(chain.read).not.toHaveBeenCalled();
  });
  it('rejects a financial state different from its projection', async () => {
    await expect(workflow('0', 'FUNDING', sync)).rejects.toThrow('does not match');
  });
  it('rejects an orphaned checkpoint and a fork occurring during reads', async () => {
    await expect(workflow('0', 'FUNDED', { ...sync, lastIndexedBlockHash: `0x${'2'.repeat(64)}` })).rejects.toThrow('checkpoint changed');
    chain.client.getBlock.mockResolvedValueOnce({ hash, timestamp: 100n }).mockResolvedValueOnce({ hash: `0x${'2'.repeat(64)}`, timestamp: 100n });
    await expect(workflow('0', 'FUNDED', sync)).rejects.toThrow('checkpoint changed');
  });
});
