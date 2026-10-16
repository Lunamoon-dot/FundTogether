import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { AuthGuard } from "../modules/auth/auth.guard";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { RewardCreatorController } from "./reward-creator.controller";
import { RewardPublicController } from "./reward-public.controller";
import { RewardBackerController } from "./reward-backer.controller";
import { RewardResolverController } from "./reward-resolver.controller";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardPledgeService } from "./reward-pledge.service";
import { RewardCryptoService } from "./reward-crypto.service";
import { RewardIndexerService } from "./reward-indexer.service";
import { editionsDraft } from "./testing/editions-draft.fixture";

// Authentication itself is covered by the full acceptance suite. Inject a principal at that boundary only.
jest.mock("../modules/auth/auth.guard", () => ({ AuthGuard: class AuthGuard {} }));

const { migrateRewardDatabase } = require("../../scripts/reward/migrate-isolated.cjs");
const root = resolve(__dirname, "../../..");

describe("Editions real HTTP + PostgreSQL draft boundary", () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let pool: Pool;
  let admin: Client;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let owner: string;
  let stranger: string;
  let resolver: string;
  let id: string;
  let entitlementId: string;
  const databaseName = `fundtogether_reward_editions_test_${process.pid}`;
  const hash = `0x${"1".repeat(64)}`;
  const post = (url: string, actor = owner) => request(app.getHttpServer()).post(url).set("x-test-user", actor);

  beforeAll(async () => {
    const env = require("dotenv").parse(readFileSync(resolve(root, ".local/reward/backend.env")));
    const url = new URL(env.DATABASE_URL);
    url.pathname = "/postgres";
    admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    await migrateRewardDatabase(root, { databaseUrl: url.toString(), expectedDatabaseName: databaseName });
    pool = new Pool({ connectionString: url.toString() });
    db = drizzle(pool, { schema });
    const users = await db.insert(schema.users).values([
      { email: "creator@editions.test" }, { email: "stranger@editions.test" }, { email: "resolver@editions.test" },
    ]).returning();
    [owner, stranger, resolver] = users.map(user => user.id);
    await db.insert(schema.rewardCreatorProfiles).values({ userId: owner, displayName: "Creator", bio: "A comic artist", ipDeclaration: "I own the publication rights", status: "VERIFIED" });
    await db.insert(schema.platformRoles).values({ userId: resolver, roles: ["RESOLVER"] });
    const module = await Test.createTestingModule({
      controllers: [RewardCreatorController, RewardPublicController, RewardBackerController, RewardResolverController],
      providers: [RewardCampaignService, RewardPledgeService, RewardCryptoService,
        { provide: DRIZZLE_DB, useValue: db },
        // R1 must reject before touching RPC; real chain behavior is covered by the preserved acceptance suite.
        { provide: RewardIndexerService, useValue: { processReceipt: () => { throw new Error("R1 must not process a receipt"); } } },
      ],
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const userId = req.headers["x-test-user"];
        req.account = { userId, roles: userId === resolver ? ["RESOLVER"] : [] };
        return Boolean(userId);
      },
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  });

  it("persists a normalized owner-bound PDF config without a monetary commitment or inventory tier", async () => {
    const res = await post("/v1/reward/creator/campaigns").send(editionsDraft());
    expect(res.status).toBe(201);
    id = res.body.id;
    expect(res.body).toMatchObject({ creatorUserId: owner, status: "DRAFT", commitmentHash: null, onchainCampaignId: null, policyHash: null, draftConfig: editionsDraft(), tiers: [] });
    const [stored] = await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, id));
    expect((stored as any).draftConfig.tiers).toEqual(editionsDraft().tiers);
    expect(await db.select().from(schema.rewardTiers)).toHaveLength(0);
  });

  it("requires a verified creator", async () => {
    expect((await post("/v1/reward/creator/campaigns", stranger).send(editionsDraft())).status).toBe(403);
  });

  it.each([
    { category: "COMICS" }, { category: "GAMES" }, { shipping: {} }, { address: "123 Example Street" },
    { tracking: "carrier" }, { creatorUserId: "spoofed" }, { status: "PUBLISHED" },
    { policyVersion: "old" }, { tiers: [] },
  ])("rejects incompatible payload without persistence: %j", async patch => {
    expect((await post("/v1/reward/creator/campaigns").send({ ...editionsDraft(), ...patch })).status).toBe(400);
    expect(await db.select().from(schema.rewardCampaigns)).toHaveLength(1);
  });

  it("revalidates direct service calls and rejects nested reward injection", async () => {
    const input = editionsDraft();
    (input.tiers[0].rewardItems[0] as any).address = "123 Example Street";
    await expect(app.get(RewardCampaignService).createDraft(owner, input)).rejects.toMatchObject({ status: 400 });
    expect((await post("/v1/reward/creator/campaigns").send(input)).status).toBe(400);
    expect(await db.select().from(schema.rewardCampaigns)).toHaveLength(1);
  });

  it("keeps the draft readable by its owner and absent from public/other-creator reads", async () => {
    const own = await request(app.getHttpServer()).get(`/v1/reward/creator/campaigns/${id}`).set("x-test-user", owner);
    expect(own.status).toBe(200);
    expect(own.body.draftConfig).toEqual(editionsDraft());
    expect((await request(app.getHttpServer()).get(`/v1/reward/creator/campaigns/${id}`).set("x-test-user", stranger)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/v1/reward/public/campaigns/${id}`)).status).toBe(404);
    expect((await request(app.getHttpServer()).get("/v1/reward/public/campaigns")).body).toEqual([]);
  });

  it("returns the canonical Editions chain state when the legacy on-chain ID is null", async () => {
    const projectionCampaign = await app.get(RewardCampaignService).createDraft(owner, editionsDraft());
    const streamId = `editions:test:${process.pid}`;
    await db.insert(schema.indexerStreams).values({ streamId, status: "ready" });
    await db.update(schema.rewardCampaigns).set({ status: "APPROVED", onchainCampaignId: null }).where(eq(schema.rewardCampaigns.id, projectionCampaign.id));
    await db.insert(schema.editionsChainCampaigns).values({
      streamId,
      onchainCampaignId: "7",
      campaignId: projectionCampaign.id,
      canonical: true,
      snapshot: {
        creator: `0x${"1".repeat(40)}`, commitmentHash: hash, goal: "1000000000", price: "10000000",
        fundingDeadline: "1791900000", releaseDeadline: "1794900000", raised: "10000000", escrowed: "10000000",
        state: 4, productionHash: `0x${"0".repeat(64)}`, productionApproved: false, pdfHash: `0x${"0".repeat(64)}`,
        releaseEvidenceHash: `0x${"0".repeat(64)}`, reviewRequestedAt: "0", challengeDeadline: "0", disputeDeadline: "0", openDisputes: "0",
      },
    });

    const response = await request(app.getHttpServer()).get("/v1/reward/creator/campaigns/mine").set("x-test-user", owner);
    expect(response.status).toBe(200);
    expect(response.body.find((campaign: any) => campaign.id === projectionCampaign.id)).toMatchObject({
      onchainCampaignId: null,
      projection: { state: 4 },
    });
  });

  it.each(["freeze", "submit-review", "onchain"])("blocks Editions %s before writes or receipt processing", async action => {
    const body = action === "onchain" ? { onchainCampaignId: "0", txHash: hash } : {};
    expect((await post(`/v1/reward/creator/campaigns/${id}/${action}`).send(body)).status).toBe(409);
    const [stored] = await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, id));
    expect(stored.status).toBe("DRAFT");
    expect(stored.commitmentHash).toBeNull();
  });

  it("does not let another creator advance the draft", async () => {
    expect((await post(`/v1/reward/creator/campaigns/${id}/freeze`, stranger).send({})).status).toBe(403);
    expect((await post(`/v1/reward/creator/campaigns/${id}/onchain`, stranger).send({ onchainCampaignId: "0", txHash: hash })).status).toBe(403);
  });

  it("blocks review and physical writes even if a stored status is forced forward", async () => {
    await db.update(schema.rewardCampaigns).set({ status: "UNDER_REVIEW" }).where(eq(schema.rewardCampaigns.id, id));
    expect((await post(`/v1/reward/resolver/campaigns/${id}/review`, resolver).send({ outcome: "APPROVED", decisionReason: "Approved for testing only" })).status).toBe(409);
    await db.update(schema.rewardCampaigns).set({ status: "PRODUCTION_VERIFIED" }).where(eq(schema.rewardCampaigns.id, id));
    expect((await request(app.getHttpServer()).get("/v1/reward/public/campaigns")).body).toEqual([]);
    expect((await request(app.getHttpServer()).get(`/v1/reward/public/campaigns/${id}`)).status).toBe(404);
    const [tier] = await db.insert(schema.rewardTiers).values({ campaignId: id, tierIndex: 0, title: "Injected old tier", description: "Adversarial stored fixture", price: "10000000", maxQuantity: 10, isDigital: false }).returning();
    const [entitlement] = await db.insert(schema.rewardEntitlements).values({ campaignId: id, tierId: tier.id, backerUserId: owner, backerWallet: `0x${"1".repeat(40)}`, amountPaid: "10000000", status: "FULFILLING" }).returning();
    entitlementId = entitlement.id;
    expect((await post(`/v1/reward/backer/entitlements/${entitlementId}/shipping`).send({ fullName: "Example User", address: "123 Example Street", phone: "1234567890" })).status).toBe(404);
    expect((await post(`/v1/reward/creator/campaigns/${id}/batches`).send({ batchNumber: 1, title: "Batch one", carrier: "Carrier", manifestHash: hash, shippedItemCount: 1, trackingCodes: { [entitlementId]: "TRACK-1" } })).status).toBe(404);
    expect((await post(`/v1/reward/creator/entitlements/${entitlementId}/delivered`).send({})).status).toBe(404);
    expect((await post(`/v1/reward/backer/entitlements/${entitlementId}/confirm`).send({})).status).toBe(404);
    expect((await post(`/v1/reward/resolver/campaigns/${id}/fulfillment-complete`, resolver).send({ fulfillmentReportHash: hash, txHash: hash })).status).toBe(404);
    const [stored] = await db.select().from(schema.rewardEntitlements).where(eq(schema.rewardEntitlements.id, entitlementId));
    expect(stored).toMatchObject({ status: "FULFILLING" });
    expect(await db.select().from(schema.rewardReviews)).toHaveLength(0);
  });

  it("holds the draft when either the config or category identifies Editions", async () => {
    await db.update(schema.rewardCampaigns).set({ category: "COMICS", policyHash: hash }).where(eq(schema.rewardCampaigns.id, id));
    expect((await post(`/v1/reward/creator/campaigns/${id}/freeze`).send({})).status).toBe(409);
    await db.update(schema.rewardCampaigns).set({ category: "COMICS_ARTBOOK", draftConfig: null }).where(eq(schema.rewardCampaigns.id, id));
    expect((await post(`/v1/reward/creator/campaigns/${id}/freeze`).send({})).status).toBe(409);
    expect((await request(app.getHttpServer()).get("/v1/reward/public/campaigns")).body).toEqual([]);
  });

  it("rejects unsupported fields on receipt/review/profile and bodyless write routes", async () => {
    for (const url of ["/v1/reward/backer/notify-pledge", "/v1/reward/backer/claim-refund", "/v1/reward/public/sync-receipt"]) {
      expect((await post(url).send({ txHash: hash, shipping: {} })).status).toBe(400);
    }
    expect((await post("/v1/reward/creator/profile").send({ displayName: "Example", bio: "Artist biography", ipDeclaration: "I hold all rights", address: "123 Example" })).status).toBe(400);
    expect((await post(`/v1/reward/creator/campaigns/${id}/freeze`).send({ tracking: "TRACK" })).status).toBe(400);
    expect((await post(`/v1/reward/backer/entitlements/${entitlementId}/confirm`).send({ address: "123 Example" })).status).toBe(404);
  });
});
