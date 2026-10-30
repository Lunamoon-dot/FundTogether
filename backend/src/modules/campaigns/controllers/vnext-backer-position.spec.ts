import { VNextController } from './vnext.controller';

describe('VNextController Backer refund position', () => {
  it('separates the indexed claimed flag from the on-chain claimed flag and amount', async () => {
    const wallet = '0x0000000000000000000000000000000000000001';
    const indexedRow = {
      backerAddress: wallet,
      contributed: '10000000',
      refunded: '0',
      refundClaimed: true,
      lastBlockNumber: '42',
    };
    const db = {
      select: () => ({
        from: () => ({ where: async () => [indexedRow] }),
      }),
    };
    const values: Record<string, bigint | boolean> = {
      contributionOf: 10_000_000n,
      refundEntitlement: 0n,
      refundClaimed: true,
      refundAllocationsFrozen: true,
    };
    const connection = {
      manifest: {
        chainId: 31339,
        campaignEscrow: '0x0000000000000000000000000000000000000002',
        genesisHash: '0xabc',
      },
      client: {
        readContract: jest.fn(async ({ functionName }: { functionName: string }) => values[functionName]),
      },
    };
    const controller = new VNextController(db as never, connection as never);

    const result = await controller.backerPosition('7', {
      account: { wallets: [{ chainId: 31339, address: wallet }] },
    } as never);

    expect(result).toEqual([expect.objectContaining({
      backerAddress: wallet,
      refundClaimed: true,
      refundEntitlement: '0',
      indexedRefunded: '0',
      indexedRefundClaimed: true,
      lastBlockNumber: '42',
    })]);
  });
});
