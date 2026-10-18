import { CampaignService } from "../services/campaign.service";

describe("Campaign transaction wallets", () => {
  it("includes a linked Resolver wallet for transaction authorization", async () => {
    const resolverWallet = {
      id: "resolver-wallet-link",
      chainId: "31339",
      address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    };
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [resolverWallet],
        }),
      }),
    };
    const service = new CampaignService(db as any, {} as any);

    await expect(service.transactionWallets("resolver-user")).resolves.toEqual([resolverWallet]);
  });
});
