import { RewardIndexerService } from "./reward-indexer.service";

describe("RewardIndexerService Unit Tests", () => {
  let service: RewardIndexerService;
  let mockDb: any;
  let fakeEntitlements: any[];
  let fakeCampaigns: any[];
  let fakeTiers: any[];
  let fakeUsers: any[];

  beforeEach(() => {
    fakeEntitlements = [];
    fakeCampaigns = [
      {
        id: "camp-uuid-1",
        onchainCampaignId: "1",
        commitmentHash: "0x" + "a".repeat(64),
        status: "PUBLISHED",
      },
    ];
    fakeTiers = [
      {
        id: "tier-uuid-0",
        campaignId: "camp-uuid-1",
        tierIndex: 0,
        isDigital: true,
        pledgedQuantity: 0,
      },
      {
        id: "tier-uuid-1",
        campaignId: "camp-uuid-1",
        tierIndex: 1,
        isDigital: false,
        pledgedQuantity: 0,
      },
    ];
    fakeUsers = [
      {
        id: "user-uuid-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
      },
    ];

    mockDb = {
      select: jest.fn().mockImplementation((projection?: any) => ({
        from: jest.fn().mockImplementation((table: any) => ({
          where: jest.fn().mockImplementation((condition: any) => {
            // Very simple mock query responses based on context
            return [];
          }),
          innerJoin: jest.fn().mockImplementation(() => ({
            where: jest.fn().mockImplementation(() => {
              return fakeEntitlements
                .filter(e => {
                  const t = fakeTiers.find(tier => tier.id === e.tierId);
                  return t?.isDigital && !e.digitalAccessCode;
                })
                .map(e => ({
                  entitlementId: e.id,
                  isDigital: true,
                }));
            }),
          })),
        })),
      })),
      insert: jest.fn().mockImplementation((table: any) => ({
        values: jest.fn().mockImplementation((val: any) => ({
          returning: jest.fn().mockReturnValue([val]),
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockReturnValue([val]),
          }),
          onConflictDoUpdate: jest.fn().mockResolvedValue([val]),
        })),
      })),
      update: jest.fn().mockImplementation((table: any) => ({
        set: jest.fn().mockImplementation((val: any) => ({
          where: jest.fn().mockImplementation((condition: any) => {
            return [val];
          }),
        })),
      })),
      transaction: jest.fn().mockImplementation(async (callback: any) => {
        return callback(mockDb);
      }),
    };

    service = new RewardIndexerService(mockDb);
  });

  it("gating: RewardPledged records entitlement with digitalAccessCode as NULL", async () => {
    // Mock selecting duplicate -> null, campaign -> found, tier -> found, user -> found
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => {
          return [fakeTiers[0]]; // return found
        }),
      })),
    }));

    // Mock query routing
    let selectCall = 0;
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => {
          selectCall++;
          if (selectCall === 1) return [fakeCampaigns[0]]; // campaign found
          if (selectCall === 2) return [fakeTiers[0]]; // digital tier
          if (selectCall === 3) return [{ userId: fakeUsers[0].id, address: fakeUsers[0].walletAddress }]; // backer walletLink
          return [];
        }),
      })),
    }));

    const events = [
      {
        eventName: "RewardPledged",
        args: {
          campaignId: 1n,
          backer: "0x1111111111111111111111111111111111111111",
          tierId: 0n,
          quantity: 2n,
          amount: 50000000n,
        },
        logIndex: 0,
        transactionHash: "0x" + "b".repeat(64),
      },
    ];

    let insertedValues: any = null;
    mockDb.insert.mockImplementation(() => ({
      values: jest.fn().mockImplementation((val: any) => {
        if (val && (val.backerWallet || val.tierId)) {
          insertedValues = val;
          fakeEntitlements.push({ ...val, id: "entitlement-uuid-1" });
        }
        return {
          returning: jest.fn().mockReturnValue([val]),
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockReturnValue([val]),
          }),
          onConflictDoUpdate: jest.fn().mockResolvedValue([val]),
        };
      }),
    }));

    const result = await service.processEvents(events);
    expect(result.entitlementsCreated).toBe(1);
    expect(insertedValues).toBeDefined();
    expect(insertedValues.digitalAccessCode).toBeNull();
    expect(insertedValues.status).toBe("ACTIVE");
    expect(insertedValues.quantity).toBe(2);
  });

  it("unlocking: ProductionVerified issues digital access codes for digital tiers", async () => {
    fakeEntitlements.push({
      id: "entitlement-uuid-1",
      campaignId: "camp-uuid-1",
      tierId: "tier-uuid-0",
      status: "ACTIVE",
      digitalAccessCode: null,
    });

    let selectCall = 0;
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => {
          return [fakeCampaigns[0]];
        }),
        innerJoin: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            return [{ entitlementId: "entitlement-uuid-1", isDigital: true }];
          }),
        })),
      })),
    }));

    let updatedSetVal: any = null;
    mockDb.update.mockImplementation(() => ({
      set: jest.fn().mockImplementation((val: any) => {
        updatedSetVal = val;
        return {
          where: jest.fn().mockReturnValue([val]),
        };
      }),
    }));

    const events = [
      {
        eventName: "ProductionVerified",
        args: {
          campaignId: 1n,
          reportHash: "0x" + "c".repeat(64),
        },
        logIndex: 1,
        transactionHash: "0x" + "d".repeat(64),
      },
    ];

    const result = await service.processEvents(events);
    expect(result.digitalKeysIssued).toBe(1);
    expect(updatedSetVal).toBeDefined();
    expect(updatedSetVal.digitalAccessCode).toMatch(/^COMIC-READ-[A-F0-9]{8}-\d{4}$/);
  });

  it("wind-down: WindDownStarted transitions active entitlements to REFUND_ELIGIBLE", async () => {
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => {
          return [fakeCampaigns[0]];
        }),
      })),
    }));

    const updatedSets: any[] = [];
    mockDb.update.mockImplementation(() => ({
      set: jest.fn().mockImplementation((val: any) => {
        updatedSets.push(val);
        return {
          where: jest.fn().mockReturnValue([val]),
        };
      }),
    }));

    const events = [
      {
        eventName: "WindDownStarted",
        args: {
          campaignId: 1n,
        },
        logIndex: 2,
        transactionHash: "0x" + "e".repeat(64),
      },
    ];

    await service.processEvents(events);
    // 1st update is campaign -> STOPPED, 2nd update is entitlements -> REFUND_ELIGIBLE
    expect(updatedSets.some(s => s.status === "STOPPED")).toBe(true);
    expect(updatedSets.some(s => s.status === "REFUND_ELIGIBLE")).toBe(true);
  });

  it("refund: RefundClaimed marks backer entitlement REFUNDED to prevent double spend", async () => {
    mockDb.select.mockImplementation(() => ({
      from: jest.fn().mockImplementation(() => ({
        where: jest.fn().mockImplementation(() => {
          return [fakeCampaigns[0]];
        }),
      })),
    }));

    const updatedSets: any[] = [];
    mockDb.update.mockImplementation(() => ({
      set: jest.fn().mockImplementation((val: any) => {
        updatedSets.push(val);
        return {
          where: jest.fn().mockReturnValue([val]),
        };
      }),
    }));

    const events = [
      {
        eventName: "RefundClaimed",
        args: {
          campaignId: 1n,
          backer: "0x1111111111111111111111111111111111111111",
        },
        logIndex: 3,
        transactionHash: "0x" + "f".repeat(64),
      },
    ];

    await service.processEvents(events);
    expect(updatedSets.some(s => s.status === "REFUNDED")).toBe(true);
  });
});
