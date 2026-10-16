import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { AuthGuard } from "../modules/auth/auth.guard";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { RewardEditionsController, RewardEditionsPreviewController } from "./reward-editions.controller";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";
import { RewardEditionsService } from "./reward-editions.service";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardCryptoService } from "./reward-crypto.service";
import { RewardIndexerService } from "./reward-indexer.service";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { editionsDraft } from "./testing/editions-draft.fixture";

// Inject only the authenticated principal; database, services, HTTP and private MinIO are real.
jest.mock("../modules/auth/auth.guard", () => ({ AuthGuard: class AuthGuard {} }));
const { migrateRewardDatabase } = require("../../scripts/reward/migrate-isolated.cjs");
const root = resolve(__dirname, "../../..");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=", "base64");

describe("Editions freeze/review: real HTTP, PostgreSQL and private object storage", () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let pool: Pool;
  let admin: Client;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let storage: EvidenceStorageService;
  let owner: string;
  let stranger: string;
  let resolver: string;
  let adminUser: string;
  let walletId: string;
  let strangerWallet: string;
  let id: string;
  const databaseName = `fundtogether_reward_review_test_${process.pid}`;
  const api = () => request(app.getHttpServer());
  const path = (action = "") => `/v1/reward/editions/campaigns/${id}${action}`;
  const post = (action: string, body: object, actor = owner) => api().post(path(action)).set("x-test-user", actor).send(body);
  const update = (body: object, actor = owner) => api().patch(path()).set("x-test-user", actor).send(body);
  const upload = (actor = owner) => api().post(path("/samples")).set("x-test-user", actor).attach("file", png, { filename: "page.png", contentType: "image/png" });
  const current = async () => (await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, id)))[0];
  const input = (sampleId: string) => ({ revision: 0, config: editionsDraft(), preparation: {
    payoutWalletLinkId: walletId, sampleIds: [sampleId], contentOutline: "A story in twelve illustrated chapters.",
    budgetPlan: "Creator budgets time for drawing and editing.", evidencePlan: "Submit page proofs for independent review.",
    releaseWindow: { start: "2027-01-01T00:00:00Z", end: "2027-02-01T00:00:00Z" },
  } });
  const prepare = async () => {
    const sample = await upload();
    expect(sample.status).toBe(201);
    const body = input(sample.body.id);
    expect((await update(body)).status).toBe(200);
    return body;
  };
  const submit = async () => {
    await prepare();
    const frozen = await post("/freeze", { revision: 1 });
    expect(frozen.status).toBe(201);
    expect((await post("/submit-review", { revision: 2 })).status).toBe(201);
    return frozen.body;
  };

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
    [owner, stranger, resolver, adminUser] = (await db.insert(schema.users).values([
      { email: "owner@review.test" }, { email: "stranger@review.test" }, { email: "resolver@review.test" }, { email: "admin@review.test" },
    ]).returning()).map(user => user.id);
    await db.insert(schema.rewardCreatorProfiles).values({ userId: owner, displayName: "Artist", bio: "Independent comic artist", ipDeclaration: "I hold the publication rights for this comic", status: "VERIFIED" });
    await db.insert(schema.platformRoles).values([{ userId: resolver, roles: ["RESOLVER"] }, { userId: adminUser, roles: ["ADMIN"] }, { userId: owner, roles: ["RESOLVER"] }]);
    [walletId, strangerWallet] = (await db.insert(schema.walletLinks).values([
      { userId: owner, chainId: "31339", address: `0x${"1".repeat(40)}` }, { userId: stranger, chainId: "31339", address: `0x${"2".repeat(40)}` },
    ]).returning()).map(wallet => wallet.id);
    const config = new ConfigService({ s3Endpoint: env.S3_ENDPOINT, s3Region: env.S3_REGION || "us-east-1",
      s3Bucket: `${env.S3_BUCKET}-review-test-${process.pid}`, s3AccessKeyId: env.S3_ACCESS_KEY_ID, s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY });
    const module = await Test.createTestingModule({
      controllers: [RewardEditionsController, RewardEditionsPreviewController],
      providers: [RewardEditionsService, EvidenceStorageService, RewardCampaignService, RewardCryptoService,
        { provide: ConfigService, useValue: config }, { provide: DRIZZLE_DB, useValue: db },
        { provide: RewardEditionsPublicationService, useValue: { canonicalCampaignStates: async () => new Map<string, number>() } },
        { provide: RewardIndexerService, useValue: { processReceipt: () => { throw new Error("Review cannot process receipts"); } } },
      ],
    }).overrideGuard(AuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const userId = req.headers["x-test-user"];
      req.account = { userId, roles: [] };
      return Boolean(userId);
    } }).compile();
    app = module.createNestApplication();
    await app.init();
    storage = app.get(EvidenceStorageService);
  });

  beforeEach(async () => { id = (await app.get(RewardCampaignService).createDraft(owner, editionsDraft())).id; });
  afterAll(async () => {
    if (db && storage) for (const sample of await db.select().from(schema.rewardEditionsSamples)) await storage.remove(sample.objectId);
    await app?.close();
    await pool?.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
  });

  it("requires login and campaign ownership for private samples and updates", async () => {
    expect((await api().get(path("/samples"))).status).toBe(403);
    expect((await upload(stranger)).status).toBe(403);
    const sample = await upload();
    expect((await update(input(sample.body.id), stranger)).status).toBe(403);
    expect((await api().get(path(`/samples/${sample.body.id}`)).set("x-test-user", stranger)).status).toBe(403);
    expect((await api().get(path(`/samples/${sample.body.id}`)).set("x-test-user", resolver)).status).toBe(403);
    const own = await api().get(path(`/samples/${sample.body.id}`)).set("x-test-user", owner);
    expect(own.status).toBe(200);
    expect(own.headers["cache-control"]).toBe("private, no-store");
    expect(own.body).toEqual(png);
  });

  it("rejects false file MIME, extra multipart fields and oversized files before persistence", async () => {
    const before = (await db.select().from(schema.rewardEditionsSamples)).length;
    expect((await api().post(path("/samples")).set("x-test-user", owner).attach("file", Buffer.from("not a PDF"), { filename: "fake.pdf", contentType: "application/pdf" })).status).toBe(400);
    expect((await api().post(path("/samples")).set("x-test-user", owner).field("address", "forbidden").attach("file", png, "page.png")).status).toBe(400);
    expect((await api().post(path("/samples")).set("x-test-user", owner).attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), "too-large.png")).status).toBe(413);
    expect(await db.select().from(schema.rewardEditionsSamples)).toHaveLength(before);
  });

  it("requires complete preparation and owner-linked wallet on the supported chain", async () => {
    expect((await post("/freeze", { revision: 0 })).status).toBe(409);
    const sample = await upload();
    const body = input(sample.body.id);
    expect((await update({ ...body, preparation: { ...body.preparation, payoutWalletLinkId: strangerWallet } })).status).toBe(400);
    expect((await update({ ...body, preparation: { ...body.preparation, address: "forbidden" } })).status).toBe(400);
    expect((await update({ ...body, preparation: { ...body.preparation, sampleIds: [sample.body.id, sample.body.id] } })).status).toBe(400);
    expect((await current()).revision).toBe(0);
  });

  it("rechecks creator verification and ownership at freeze", async () => {
    await prepare();
    expect((await post("/freeze", { revision: 1 }, stranger)).status).toBe(403);
    await db.update(schema.rewardCreatorProfiles).set({ status: "REJECTED" }).where(eq(schema.rewardCreatorProfiles.userId, owner));
    try { expect((await post("/freeze", { revision: 1 })).status).toBe(403); }
    finally { await db.update(schema.rewardCreatorProfiles).set({ status: "VERIFIED" }).where(eq(schema.rewardCreatorProfiles.userId, owner)); }
    expect((await current()).commitmentHash).toBeNull();
  });

  it("keeps unsubmitted drafts out of Resolver lists and prevents Admin self-verification", async () => {
    expect((await app.get(RewardCampaignService).listAllForResolver()).some(c => c.id === id)).toBe(false);
    const [profile] = await db.insert(schema.rewardCreatorProfiles).values({ userId: adminUser, displayName: "Admin artist", bio: "An administrator who also draws", ipDeclaration: "I own the work I produce" }).returning();
    await expect(app.get(RewardCampaignService).adminReviewCreator(adminUser, profile.id, { outcome: "VERIFIED" })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects samples from another campaign, but does not couple the estimate to the window start", async () => {
    const sample = await upload();
    id = (await app.get(RewardCampaignService).createDraft(owner, editionsDraft())).id;
    expect((await update(input(sample.body.id))).status).toBe(400);
    const other = await upload();
    const body = input(other.body.id);
    (body.config.tiers[0] as any).estimatedDeliveryAt = "2026-12-01T00:00:00Z";
    expect((await update(body)).status).toBe(200);
    body.revision = 1;
    (body.config.tiers[0] as any).estimatedDeliveryAt = "2028-01-01T00:00:00Z";
    expect((await update(body)).status).toBe(400);
  });

  it("freezes exact terms and private evidence, pins wallet, and keeps publication closed", async () => {
    await prepare();
    const frozen = await post("/freeze", { revision: 1 });
    expect(frozen.status).toBe(201);
    expect(frozen.body).toMatchObject({ status: "FROZEN", revision: 2, policyHash: null, onchainCampaignId: null,
      frozenSnapshot: { creator: { userId: owner }, payoutWallet: { linkId: walletId, chainId: "31339" } } });
    expect(frozen.body.commitmentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(frozen.body.frozenSnapshot)).not.toMatch(/objectId|originals\//);
    await expect(db.delete(schema.walletLinks).where(eq(schema.walletLinks.id, walletId))).rejects.toThrow();
    expect((await upload()).status).toBe(409);
    expect((await post("/freeze", { revision: 2 })).status).toBe(409);
    await expect(app.get(RewardCampaignService).registerOnchain(id, owner, "0")).rejects.toMatchObject({ status: 409 });
  });

  it("fails freeze when private bytes are missing or changed", async () => {
    await prepare();
    const [sample] = await db.select().from(schema.rewardEditionsSamples).where(eq(schema.rewardEditionsSamples.campaignId, id));
    await storage.put(sample.objectId, Buffer.from("changed bytes"), sample.mediaType);
    expect((await post("/freeze", { revision: 1 })).status).toBe(503);
    expect((await current()).status).toBe("DRAFT");
  });

  it("serializes freeze versus edit and rejects stale revisions", async () => {
    const body = await prepare();
    const [freeze, edit] = await Promise.all([post("/freeze", { revision: 1 }), update({ ...body, revision: 1, config: { ...body.config, title: "Revised title for the comic" } })]);
    expect([freeze.status, edit.status].sort()).toEqual([freeze.status === 201 ? 201 : 200, 409].sort());
    const stored = await current();
    expect(stored.revision).toBe(2);
    if (stored.status === "FROZEN") expect(stored.frozenSnapshot!.config.title).toBe(body.config.title);
    else expect(stored.title).toBe("Revised title for the comic");
    expect((await update({ ...body, revision: 1 })).status).toBe(409);
  });

  it("requires Resolver role, disallows self-review, and targets an exact hash", async () => {
    const frozen = await submit();
    const decision = { outcome: "APPROVED", decisionReason: "Reviewed the comic and sample evidence", commitmentHash: frozen.commitmentHash };
    for (const actor of [owner, stranger, adminUser]) expect((await post("/review", decision, actor)).status).toBe(403);
    expect((await api().post(path("/open-community-review")).set("x-test-user", owner)).status).toBe(403);
    expect((await api().post(path("/open-community-review")).set("x-test-user", stranger)).status).toBe(403);
    expect((await api().post(path("/open-community-review")).set("x-test-user", adminUser)).status).toBe(403);
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    expect((await post("/review", { ...decision, commitmentHash: `0x${"0".repeat(64)}` }, resolver)).status).toBe(409);
    expect((await post("/review", { ...decision, shipping: {} }, resolver)).status).toBe(400);
    expect((await current()).status).toBe("COMMUNITY_REVIEW");
  });

  it("records when review starts without imposing a time-based Resolver deadline", async () => {
    const frozen = await submit();
    const submitted = await current();
    expect(submitted.reviewStartedAt).not.toBeNull();
    expect(submitted).not.toHaveProperty("reviewDeadlineAt");
    expect((await api().get(`/v1/reward/public/editions/${id}`)).status).toBe(404);
    expect((await api().get("/v1/reward/public/editions/review")).body.some((item: any) => item.id === id)).toBe(false);
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    expect((await api().get(`/v1/reward/public/editions/${id}`)).status).toBe(200);

    await db.update(schema.rewardCampaigns).set({ reviewStartedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }).where(eq(schema.rewardCampaigns.id, id));
    const approved = await post("/review", { outcome: "APPROVED", decisionReason: "Reviewed when the agreed checklist was complete", commitmentHash: frozen.commitmentHash }, resolver);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe("APPROVED");
  });

  it("preserves old reviewed terms through corrections and rejects stale decisions", async () => {
    const frozen = await submit();
    const decision = { outcome: "CHANGES_REQUESTED", decisionReason: "Please clarify the ending in the outline", commitmentHash: frozen.commitmentHash };
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    const corrected = await post("/review", decision, resolver);
    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({ status: "DRAFT", frozenSnapshot: null, commitmentHash: null, payoutWalletLinkId: null, reviewStartedAt: null, revision: 4 });
    expect(corrected.body).not.toHaveProperty("reviewDeadlineAt");
    const [review] = await db.select().from(schema.rewardReviews).where(eq(schema.rewardReviews.campaignId, id));
    expect(review.frozenSnapshot).toEqual(frozen.frozenSnapshot);
    const old = await current();
    expect((await update({ revision: 4, config: { ...old.draftConfig, title: "A new title with clarified scope" }, preparation: old.reviewPreparation })).status).toBe(200);
    expect((await post("/freeze", { revision: 5 })).status).toBe(201);
    expect((await post("/submit-review", { revision: 6, responseBody: "Cảm ơn Resolver; tôi đã làm rõ phần kết thúc theo yêu cầu." })).status).toBe(201);
    expect((await post("/review", { ...decision, outcome: "APPROVED" }, resolver)).status).toBe(409);
    expect((await current()).commitmentHash).not.toBe(frozen.commitmentHash);
  });

  it("requires and stores one general Creator response when resubmitting after feedback", async () => {
    const frozen = await submit();
    const [feedback] = await db.insert(schema.editionsFeedback).values({
      campaignId: id,
      authorUserId: stranger,
      targetHash: frozen.commitmentHash,
      kind: "ISSUE",
      body: "Please clarify how the final chapter will be edited.",
      bodyHash: "feedback-hash-for-response-test",
    }).returning();
    const decision = { outcome: "CHANGES_REQUESTED", decisionReason: "Clarify the production plan", commitmentHash: frozen.commitmentHash };
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    expect((await post("/review", decision, resolver)).status).toBe(201);
    const old = await current();
    const body = await update({ revision: old.revision, config: { ...old.draftConfig, title: "A clarified comic edition" }, preparation: old.reviewPreparation });
    expect(body.status).toBe(200);
    expect((await post("/freeze", { revision: body.body.revision })).status).toBe(201);
    const currentFrozen = await current();

    expect((await post("/submit-review", { revision: currentFrozen.revision })).status).toBe(400);
    expect((await post("/submit-review", {
      revision: currentFrozen.revision,
      responseBody: "Cảm ơn góp ý; tôi đã cập nhật lại phạm vi biên tập và kế hoạch hoàn thiện.",
      relatedFeedbackIds: [randomUUID()],
    })).status).toBe(400);
    expect(await db.select().from(schema.editionsCreatorResponses).where(eq(schema.editionsCreatorResponses.campaignId, id))).toHaveLength(0);

    const submitted = await post("/submit-review", {
      revision: currentFrozen.revision,
      responseBody: "Cảm ơn góp ý; tôi đã cập nhật lại phạm vi biên tập và kế hoạch hoàn thiện.",
      relatedFeedbackIds: [feedback.id],
    });
    expect(submitted.status).toBe(201);
    expect(await db.select({ campaignId: schema.editionsCreatorResponses.campaignId, submissionRevision: schema.editionsCreatorResponses.submissionRevision,
      commitmentHash: schema.editionsCreatorResponses.commitmentHash, responseBody: schema.editionsCreatorResponses.responseBody,
    }).from(schema.editionsCreatorResponses).where(eq(schema.editionsCreatorResponses.campaignId, id))).toEqual([expect.objectContaining({
      campaignId: id, submissionRevision: currentFrozen.revision, commitmentHash: currentFrozen.commitmentHash,
      responseBody: "Cảm ơn góp ý; tôi đã cập nhật lại phạm vi biên tập và kế hoạch hoàn thiện.",
    })]);
    expect(await db.select().from(schema.editionsCreatorResponseFeedback).where(eq(schema.editionsCreatorResponseFeedback.feedbackId, feedback.id))).toHaveLength(1);
  });

  it("approves once with a redacted public preview and private sample access", async () => {
    expect((await api().get(`/v1/reward/public/editions/${id}`)).status).toBe(404);
    const frozen = await submit();
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    const sample = await api().get(path(`/samples/${frozen.frozenSnapshot.samples[0].id}`)).set("x-test-user", resolver);
    expect(sample.status).toBe(200);
    const body = { outcome: "APPROVED", decisionReason: "Content plan, samples and IP reviewed", commitmentHash: frozen.commitmentHash };
    const results = await Promise.all([post("/review", body, resolver), post("/review", body, resolver)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await db.select().from(schema.rewardReviews).where(eq(schema.rewardReviews.campaignId, id))).toHaveLength(1);
    const preview = await api().get(`/v1/reward/public/editions/${id}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ publicationEnabled: false, config: editionsDraft(), creatorDisplayName: "Artist" });
    expect(JSON.stringify(preview.body)).not.toMatch(/ipDeclaration|objectId|sampleIds|payoutWallet|userId|decisionReason|originals\//);
    expect((await post("/freeze", { revision: 4 })).status).toBe(409);
  });

  it("rejection is terminal for this draft and never becomes a public paid campaign", async () => {
    const frozen = await submit();
    expect((await api().post(path("/open-community-review")).set("x-test-user", resolver)).status).toBe(201);
    expect((await post("/review", { outcome: "REJECTED", decisionReason: "Publication rights could not be established", commitmentHash: frozen.commitmentHash }, resolver)).status).toBe(201);
    const stopped = await current();
    expect(stopped.status).toBe("STOPPED");
    expect(stopped.frozenSnapshot).toEqual(frozen.frozenSnapshot);
    expect((await api().get(`/v1/reward/public/editions/${id}`)).status).toBe(404);
    expect((await update({ revision: stopped.revision, config: stopped.draftConfig, preparation: stopped.reviewPreparation })).status).toBe(409);
  });
});
