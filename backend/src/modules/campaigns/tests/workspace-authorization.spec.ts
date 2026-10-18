import { ConflictException, ForbiddenException } from "@nestjs/common";
import * as schema from "../../../database/schema";
import { CompletionService } from "../../completion/services/completion.service";
import { DeliveryService } from "../../delivery/services/delivery.service";
import { PayoutService } from "../../payout/services/payout.service";
import { PublicationService } from "../services/publication.service";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const creator = id("1");
const stranger = id("2");
const backer = id("3");
const resolver = id("4");
const admin = id("5");
const campaignId = id("10");

const campaign = {
  id: campaignId,
  creatorUserId: creator,
  category: "COMICS_ARTBOOK",
  status: "PUBLISHED",
  commitmentHash: `0x${"a".repeat(64)}`,
  draftConfig: { title: "Comic", tiers: [{ price: "20" }] },
  frozenSnapshot: { payoutWallet: { address: `0x${"1".repeat(40)}` } },
} as any;

function query<T>(value: T) {
  const builder: any = {
    from: jest.fn(() => builder),
    where: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    orderBy: jest.fn(async () => value),
    for: jest.fn(async () => value),
    then: (resolve: (result: T) => unknown) => Promise.resolve(value).then(resolve),
  };
  return builder;
}

function dbFor(values: Map<unknown, unknown>) {
  return {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => query(values.get(table) ?? [])),
    })),
  } as any;
}

function indexer() {
  return { streamId: () => "campaigns:test-stream", runOnce: jest.fn() } as any;
}

function role(userId: string) {
  if (userId === resolver) return [{ userId, roles: ["RESOLVER"] }];
  if (userId === admin) return [{ userId, roles: ["ADMIN"] }];
  return [];
}

function accessDb(userId: string, includeBacker = false) {
  return dbFor(new Map<unknown, unknown>([
    [schema.campaigns, [campaign]],
    [schema.platformRoles, role(userId)],
    [schema.campaignEntitlements, includeBacker ? [{ id: id("20") }] : []],
    [schema.campaignPayoutRequests, []],
    [schema.campaignCompletionRequests, []],
    [schema.campaignEvidence, []],
  ]));
}

function completionService(userId: string, includeBacker = false) {
  return new CompletionService(
    accessDb(userId, includeBacker),
    {} as any,
    indexer(),
    {} as any,
  );
}

function payoutService(userId: string, includeBacker = false) {
  return new PayoutService(
    accessDb(userId, includeBacker),
    {} as any,
    indexer(),
    {} as any,
  );
}

describe("role-oriented workspace authorization matrix", () => {
  it("keeps public preview/evidence callable without an account actor", async () => {
    const publicPreview = { publicPreview: jest.fn(async () => ({ id: campaignId, status: "APPROVED" })) } as any;
    const publication = { canonicalCampaignStates: jest.fn(async () => new Map()), orphanedCampaignIds: jest.fn(async () => new Set()) } as any;
    const controller = new (require("../controllers/campaign.controller").CampaignPreviewController)(publicPreview, publication);
    await expect(controller.preview(campaignId)).resolves.toMatchObject({ id: campaignId, surface: "ACTIVATION_PENDING" });

    const delivery = new DeliveryService(
      dbFor(new Map<unknown, unknown>([[schema.campaigns, [campaign]], [schema.campaignEvidence, []]])),
      {} as any,
      indexer(),
      { chainCampaign: jest.fn(async () => ({ status: "ON_CHAIN_CONFIRMED", snapshot: { productionHash: `0x${"0".repeat(64)}`, releaseEvidenceHash: `0x${"0".repeat(64)}` } })) } as any,
    );
    await expect(delivery.publicEvidence(campaignId)).resolves.toEqual([]);
  });

  it("denies unrelated users from private evidence, publication terms, payout and completion dossiers", async () => {
    await expect(new DeliveryService(accessDb(stranger), {} as any, indexer(), {} as any).listEvidence(campaignId, stranger))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(new PublicationService(accessDb(stranger), indexer()).terms(campaignId, stranger))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(payoutService(stranger).list(campaignId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(completionService(stranger).list(campaignId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets the Creator own requests while refusing Creator actions from other actors", async () => {
    const validCompletion = { title: "Completion dossier", summary: "A complete production summary for review.", reason: "The finished campaign is ready for settlement review." };
    const validPayout = { amount: "10", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown." };

    await expect(completionService(stranger).create(campaignId, stranger, validCompletion)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(payoutService(stranger).create(campaignId, stranger, validPayout)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(completionService(resolver).create(campaignId, resolver, validCompletion)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(payoutService(resolver).create(campaignId, resolver, validPayout)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(completionService(admin).create(campaignId, admin, validCompletion)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(payoutService(admin).create(campaignId, admin, validPayout)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets a canonical Backer read dossiers but not create or decide them", async () => {
    await expect(completionService(backer, true).list(campaignId, backer)).resolves.toEqual([]);
    await expect(payoutService(backer, true).list(campaignId, backer)).resolves.toEqual([]);
    await expect(completionService(backer, true).create(campaignId, backer, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(payoutService(backer, true).create(campaignId, backer, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows Resolver review access but keeps Admin and Creator outside Resolver decisions", async () => {
    const completionRequest = { id: id("30"), campaignId, streamId: "campaigns:test-stream", status: "DRAFT", requestHash: `0x${"b".repeat(64)}`, revision: 1 };
    const payoutRequest = { id: id("31"), campaignId, streamId: "campaigns:test-stream", status: "DRAFT", requestHash: `0x${"c".repeat(64)}`, revision: 1 };
    const completionDb = dbFor(new Map<unknown, unknown>([[schema.campaignCompletionRequests, [completionRequest]], [schema.platformRoles, role(resolver)], [schema.campaigns, [campaign]]]));
    const payoutDb = dbFor(new Map<unknown, unknown>([[schema.campaignPayoutRequests, [payoutRequest]], [schema.platformRoles, role(resolver)], [schema.campaigns, [campaign]]]));
    const chain = { chainCampaign: jest.fn(async () => ({ status: "ON_CHAIN_CONFIRMED", chainTimestamp: "1000", snapshot: { state: 5, openDisputes: "0" } })) } as any;
    const payoutChain = { chainCampaign: jest.fn(async () => ({ status: "ON_CHAIN_CONFIRMED", chainTimestamp: "1000", snapshot: { state: 3, openDisputes: "0", payoutRequestHash: payoutRequest.requestHash } })) } as any;

    const adminCompletionDb = dbFor(new Map<unknown, unknown>([[schema.campaignCompletionRequests, [completionRequest]], [schema.platformRoles, role(admin)], [schema.campaigns, [campaign]]]));
    await expect(new CompletionService(completionDb, {} as any, indexer(), { runOnce: jest.fn(), chainCampaign: chain.chainCampaign } as any)
      .prepareDecision(completionRequest.id, resolver, { outcome: "APPROVE", reason: "A complete Resolver decision reason." }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(new PayoutService(payoutDb, {} as any, indexer(), { runOnce: jest.fn(), chainCampaign: payoutChain.chainCampaign } as any)
      .prepareDecision(payoutRequest.id, resolver, { outcome: "APPROVE", reason: "A valid decision reason." }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(new CompletionService(adminCompletionDb, {} as any, indexer(), { runOnce: jest.fn(), chainCampaign: chain.chainCampaign } as any)
      .prepareDecision(completionRequest.id, admin, { outcome: "APPROVE", reason: "Admin must not decide funds." }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not let body-supplied actor or payout fields replace the authenticated actor", async () => {
    await expect(completionService(creator).create(campaignId, creator, {
      title: "Completion dossier", summary: "A complete production summary for review.", reason: "The finished campaign is ready for settlement review.", userId: stranger,
    })).rejects.toThrow();
    await expect(payoutService(creator).create(campaignId, creator, {
      amount: "10", title: "Payout", summary: "A valid enough payout summary.", reason: "A valid enough payout reason.", breakdown: "A valid breakdown.", destination: "admin",
    })).rejects.toThrow();
  });

  it("requires Admin for the Admin operations projection and does not grant Resolver authority", async () => {
    const operations = new Map<unknown, unknown>([
      [schema.campaigns, [{ id: campaignId, title: "Comic", creatorUserId: creator, status: "PUBLISHED", category: "COMICS_ARTBOOK" }]],
      [schema.campaignChainCampaigns, []],
      [schema.chainEvents, []],
    ]);
    await expect(new PublicationService(dbFor(new Map([...operations, [schema.platformRoles, role(admin)]])), indexer()).operations("admin", admin)).resolves.toHaveLength(1);
    await expect(new PublicationService(dbFor(new Map([...operations, [schema.platformRoles, role(stranger)]])), indexer()).operations("admin", stranger)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(new PublicationService(dbFor(new Map([...operations, [schema.platformRoles, role(admin)]])), indexer()).operations("resolver", admin)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
