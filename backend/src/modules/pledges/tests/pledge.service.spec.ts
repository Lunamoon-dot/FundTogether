import { ConflictException } from "@nestjs/common";
import { historicalDisputes, platformRoles } from "../../../database/schema";
import { PledgeService } from "../workflow/pledge.service";

const entitlementId = "00000000-0000-0000-0000-000000000001";
const disputeId = "00000000-0000-0000-0000-000000000002";
const backerUserId = "00000000-0000-0000-0000-000000000003";
const resolverUserId = "00000000-0000-0000-0000-000000000004";

function queryBuilder(result: unknown[]) {
  const builder: any = {
    from: jest.fn(() => builder),
    where: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(result)),
    for: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function makeDb(options: {
  entitlement: { backerUserId: string; status: string };
  dispute?: { id: string; entitlementId: string; status: string };
  insertConflict?: boolean;
}) {
  const insertedDispute = {
    id: disputeId,
    entitlementId,
    backerUserId,
    status: "OPEN",
  };
  const updatedDispute = { ...insertedDispute, status: "RESOLVED_BACKER" };
  const db: any = {
    select: jest.fn(() => {
      const builder: any = queryBuilder([]);
      builder.from.mockImplementation((table: unknown) => {
        const result = table === platformRoles
          ? [{ userId: resolverUserId, roles: ["RESOLVER"] }]
          : table === historicalDisputes
            ? (options.dispute ? [options.dispute] : [])
            : [options.entitlement];
        return queryBuilder(result);
      });
      return builder;
    }),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({ returning: jest.fn().mockResolvedValue(options.insertConflict ? [] : [insertedDispute]) })),
        returning: jest.fn().mockResolvedValue([insertedDispute]),
      })),
    })),
    update: jest.fn((table: unknown) => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn().mockResolvedValue(table === historicalDisputes ? [updatedDispute] : [{ ...options.entitlement, status: "DISPUTED" }]),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve([]).then(resolve, reject),
        })),
      })),
    })),
  };
  db.transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db));
  return db;
}

describe("PledgeService historical dispute integrity", () => {
  const input = { reason: "The delivered item was materially damaged.", evidenceHash: undefined };

  it("rejects opening a dispute for refunded, refund-eligible, or already disputed entitlements", async () => {
    for (const status of ["REFUNDED", "REFUND_ELIGIBLE", "DISPUTED"]) {
      const db = makeDb({ entitlement: { backerUserId, status } });
      const service = new PledgeService(db, {} as any);
      await expect(service.openDispute(backerUserId, entitlementId, input)).rejects.toBeInstanceOf(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
    }
  });

  it("does not let a stale resolver action move a refunded entitlement back to a nonterminal state", async () => {
    const db = makeDb({
      entitlement: { backerUserId, status: "REFUNDED" },
      dispute: { id: disputeId, entitlementId, status: "OPEN" },
    });
    const service = new PledgeService(db, {} as any);
    await expect(service.resolveDispute(resolverUserId, disputeId, {
      outcome: "RESOLVED_CREATOR",
      resolutionNote: "The evidence does not support a backer refund.",
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps the database uniqueness race for a second open dispute to a conflict", async () => {
    const db = makeDb({ entitlement: { backerUserId, status: "ACTIVE" }, insertConflict: true });
    const service = new PledgeService(db, {} as any);
    await expect(service.openDispute(backerUserId, entitlementId, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it("keeps the normal eligible open-dispute path available", async () => {
    const db = makeDb({ entitlement: { backerUserId, status: "ACTIVE" } });
    const service = new PledgeService(db, {} as any);
    const dispute = await service.openDispute(backerUserId, entitlementId, input);
    expect(dispute.status).toBe("OPEN");
  });

  it("allows one valid open dispute and transitions only a disputed entitlement on resolution", async () => {
    const db = makeDb({
      entitlement: { backerUserId, status: "DISPUTED" },
      dispute: { id: disputeId, entitlementId, status: "OPEN" },
    });
    const service = new PledgeService(db, {} as any);
    const resolved = await service.resolveDispute(resolverUserId, disputeId, {
      outcome: "RESOLVED_BACKER",
      resolutionNote: "The evidence supports refund eligibility.",
    });
    expect(resolved.status).toBe("RESOLVED_BACKER");
  });
});
