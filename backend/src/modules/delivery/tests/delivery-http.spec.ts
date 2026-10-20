import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import * as request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, defineChain, http, keccak256 } from "viem";
import type { PublicClient } from "viem";
import { PDFDocument } from "pdf-lib";
import { AuthGuard } from "../../../modules/auth/auth.guard";
import { DRIZZLE_DB } from "../../../database/database.constants";
import * as schema from "../../../database/schema";
import { EvidenceStorageService } from "../../../modules/evidence/evidence-storage.service";
import { campaignAbi, campaignAbiHash, campaignPolicyHash, parseDeploymentManifest } from "../../../blockchain/deployment";
import { CAMPAIGN_CONNECTION, CampaignIndexerService } from "../../../indexer/campaign-indexer.service";
import { PublicationService } from "../../campaigns/services/publication.service";
import { ChainController } from "../../campaigns/controllers/chain.controller";
import { DeliveryService } from "../services/delivery.service";
import { DeliveryController, PublicEvidenceController } from "../controllers/delivery.controller";
import { ReviewConversationController } from "../../review/controllers/review-conversation.controller";
import { ReviewConversationService } from "../../review/services/review-conversation.service";
import { CampaignPreviewController } from "../../campaigns/controllers/campaign.controller";
import { CampaignService } from "../../campaigns/services/campaign.service";
import { campaignCommitment, CampaignSnapshot } from "../../campaigns/policies/commitment";
import { campaignDraft } from "../../campaigns/tests/fixtures/draft.fixture";

jest.mock("../../../modules/auth/auth.guard", () => ({ AuthGuard: class AuthGuard {} }));
const root = resolve(__dirname, "../../../../..");
const { migrateCampaignDatabase } = require("../../../../scripts/campaigns/migrate-isolated.cjs");
const chain = defineChain({ id: 31339, name: "Campaign delivery tests", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:9548"] } } });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=", "base64");

describe("Campaign digital delivery: real HTTP, PostgreSQL, MinIO and Anvil", () => {
  jest.setTimeout(60000);
  const client = createPublicClient({ chain, transport: http(), pollingInterval: 30 });
  let app: INestApplication, pool: Pool, admin: Client, db: ReturnType<typeof drizzle<typeof schema>>, storage: EvidenceStorageService;
  let indexer: CampaignIndexerService;
  let accounts: `0x${string}`[], address: `0x${string}`, tokenAddress: `0x${string}`;
  let owner: string, backer: string, resolver: string, stranger: string, id: string, commitment: string, threadId: string, staleThreadId: string, escalationId: string;
  let deadline: bigint, entitlementId: string, production: any, finalPdf: any, pdf: Buffer;
  let beforePledge: string;
  let approvalHash: `0x${string}`, creationHash: `0x${string}`, pledgeHash: `0x${string}`;
  let suiteSnapshot: string | undefined;
  const databaseName = `fundtogether_delivery_test_${process.pid}`;
  const wallet = (actor: `0x${string}`) => createWalletClient({ account: actor, chain, transport: http() });
  const send = async (actor: `0x${string}`, functionName: string, args: unknown[], target = address, abi = campaignAbi) => {
    const hash = await wallet(actor).writeContract({ address: target, abi, functionName, args, gas: 2000000n });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success"); return hash;
  };
  const api = () => request(app.getHttpServer());
  const route = (action: string) => `/v1/fundtogether/campaigns/campaigns/${id}/${action}`;
  const upload = (purpose: string, bytes = png, mime = "image/png", actor = owner) => api().post(route("evidence")).set("x-test-user", actor)
    .field("purpose", purpose).field("summary", "Content proof for this digital comic campaign.").attach("file", bytes, { filename: "ignored-name", contentType: mime });
  const ticket = (actor = backer) => api().post(`/v1/fundtogether/campaigns/entitlements/${entitlementId}/download`).set("x-test-user", actor).send({});
  const sync = () => indexer.runOnce();

  beforeAll(async () => {
    const env = require("dotenv").parse(readFileSync(resolve(root, ".local/fundtogether/backend.env")));
    const url = new URL(env.DATABASE_URL); url.pathname = "/postgres";
    admin = new Client({ connectionString: url.toString() }); await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`); url.pathname = `/${databaseName}`;
    await migrateCampaignDatabase(root, { databaseUrl: url.toString(), expectedDatabaseName: databaseName });
    pool = new Pool({ connectionString: url.toString() }); db = drizzle(pool, { schema });
    accounts = (await wallet(`0x${"0".repeat(40)}`).getAddresses()).map(value => value.toLowerCase() as `0x${string}`);
    expect(await client.request({ method: "web3_clientVersion" as any })).toMatch(/anvil/i);
    suiteSnapshot = await client.request({ method: "evm_snapshot" as any }) as string;
    const token = JSON.parse(readFileSync(resolve(root, "contracts/out/MockUSDC.sol/MockUSDC.json"), "utf8"));
    const contract = JSON.parse(readFileSync(resolve(root, "contracts/out/FundTogetherCampaign.sol/FundTogetherCampaign.json"), "utf8"));
    const tr = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: token.abi, bytecode: token.bytecode.object }) }); tokenAddress = tr.contractAddress!;
    const judges = accounts.slice(6, 10);
    const cr = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: contract.abi, bytecode: contract.bytecode.object, args: [tokenAddress, accounts[1], accounts[2], judges] }) }); address = cr.contractAddress!;
    const manifest = parseDeploymentManifest({ protocolKind: "CAMPAIGNS", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", abiVersion: "campaigns-local-judge-v1", abiHash: campaignAbiHash,
      policyHash: campaignPolicyHash, tokenDecimals: 6, confirmations: 1, contractAddress: address, tokenAddress, resolver: accounts[1], backupResolver: accounts[2], judges,
      genesisHash: (await client.getBlock({ blockNumber: 0n })).hash, contractCodeHash: keccak256((await client.getCode({ address }))!), tokenCodeHash: keccak256((await client.getCode({ address: tokenAddress }))!),
      deploymentBlockNumber: cr.blockNumber.toString(), deploymentBlockHash: cr.blockHash });
    [owner, backer, resolver, stranger] = (await db.insert(schema.users).values(["creator", "backer", "resolver", "community"].map(name => ({ email: `${name}@delivery.test` }))).returning()).map(user => user.id);
    await db.insert(schema.platformRoles).values({ userId: resolver, roles: ["RESOLVER", "ADMIN"] });
    const [link] = await db.insert(schema.walletLinks).values([
      { userId: owner, chainId: "31339", address: accounts[3] },
      { userId: backer, chainId: "31339", address: accounts[4] },
      { userId: resolver, chainId: "31339", address: accounts[1] },
    ]).returning();
    const [profile] = await db.insert(schema.creatorProfiles).values({ userId: owner, displayName: "Artist", bio: "Comic creator", ipDeclaration: "Private IP declaration", originalWorkPledge: true, studioWalletLinkId: link.id, status: "VERIFIED" }).returning();
    const now = (await client.getBlock()).timestamp; deadline = now + 20n * 86400n;
    const config = campaignDraft(); config.goal = "10000000"; config.fundingDuration = 86400;
    const frozen: CampaignSnapshot = { commitmentVersion: "campaigns-review-v1", config, creator: { userId: owner, profileId: profile.id, displayName: profile.displayName, ipDeclaration: profile.ipDeclaration },
      payoutWallet: { linkId: link.id, chainId: "31339", address: accounts[3] }, preparation: { contentOutline: "A comic in twelve chapters.", budgetPlan: "Art, editing and design time.", evidencePlan: "Page proofs and complete PDF." }, samples: [{ id: profile.id, mediaType: "image/png", sha256: `0x${"1".repeat(64)}`, sizeBytes: 100 }] };
    commitment = campaignCommitment(frozen);
    const reviewStartedAt = new Date();
    const [campaign] = await db.insert(schema.campaigns).values({ creatorUserId: owner, title: config.title, pitch: config.pitch, story: config.story, category: config.category,
      goal: config.goal, fundingDuration: config.fundingDuration, draftConfig: config, frozenSnapshot: frozen, commitmentHash: commitment, status: "COMMUNITY_REVIEW", frozenAt: new Date(), reviewStartedAt, payoutWalletLinkId: link.id }).returning(); id = campaign.id;
    const module = await Test.createTestingModule({ imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])], controllers: [DeliveryController, PublicEvidenceController, CampaignPreviewController, ChainController, ReviewConversationController],
      providers: [CampaignService, DeliveryService, ReviewConversationService, PublicationService, CampaignIndexerService, EvidenceStorageService,
        { provide: DRIZZLE_DB, useValue: db }, { provide: CAMPAIGN_CONNECTION, useValue: { client: client as PublicClient, manifest } },
        { provide: ConfigService, useValue: new ConfigService({ s3Endpoint: env.S3_ENDPOINT, s3Region: env.S3_REGION || "us-east-1", s3Bucket: `${env.S3_BUCKET}-delivery-test-${process.pid}`, s3AccessKeyId: env.S3_ACCESS_KEY_ID, s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY }) }],
    }).overrideGuard(AuthGuard).useValue({ canActivate(context: any) { const req = context.switchToHttp().getRequest(); req.account = { userId: req.headers["x-test-user"], roles: [] }; return Boolean(req.account.userId); } }).compile();
    app = module.createNestApplication(); await app.init(); storage = app.get(EvidenceStorageService); indexer = app.get(CampaignIndexerService);
    const document = await PDFDocument.create(); document.addPage().drawText("A verified local digital comic proof"); pdf = Buffer.from(await document.save());
    await send(accounts[0], "mint", [accounts[4], 100000000n], tokenAddress, token.abi);
    await send(accounts[4], "approve", [address, 100000000n], tokenAddress, token.abi);
  });

  it("separates review, activation and funding public surfaces", async () => {
    await db.update(schema.campaigns).set({ status: "UNDER_REVIEW_PRIVATE" }).where(eq(schema.campaigns.id, id));
    expect((await api().get("/v1/fundtogether/public/campaigns/review")).body).toEqual([]);
    expect((await api().get(`/v1/fundtogether/public/campaigns/${id}`)).status).toBe(404);
    expect((await api().post(route("feedback")).set("x-test-user", stranger).send({ targetHash: commitment, kind: "COMMENT", body: "Private review is not public yet." })).status).toBe(409);
    expect((await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: commitment, body: "A backer question before funding." })).status).toBe(409);
    await db.update(schema.campaigns).set({ status: "COMMUNITY_REVIEW" }).where(eq(schema.campaigns.id, id));
    const review = await api().get("/v1/fundtogether/public/campaigns/review");
    expect(review.status).toBe(200);
    expect(review.body).toEqual([expect.objectContaining({ id, status: "COMMUNITY_REVIEW", surface: "REVIEW" })]);
    expect(review.body[0].reviewStartedAt).toBeTruthy();
    expect(review.body[0]).not.toHaveProperty("reviewDeadlineAt");
    expect(review.body[0]).not.toHaveProperty("reviewState");
    expect((await api().get("/v1/fundtogether/public/campaigns/activation")).body).toEqual([]);
    expect((await api().get("/v1/fundtogether/public/campaigns/funding")).body).toEqual([]);

    const detail = await api().get(`/v1/fundtogether/public/campaigns/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ status: "COMMUNITY_REVIEW", surface: "REVIEW" });
    expect(detail.body).not.toHaveProperty("reviewDeadlineAt");
    expect(detail.body).not.toHaveProperty("reviewState");
    expect((await db.select({ status: schema.campaigns.status }).from(schema.campaigns).where(eq(schema.campaigns.id, id)))[0].status).toBe("COMMUNITY_REVIEW");
  });
  afterAll(async () => {
    try {
      if (db && storage) for (const item of await db.select().from(schema.campaignEvidence)) await storage.remove(item.objectId);
      await app?.close(); await pool?.end();
      if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
    } finally {
      if (suiteSnapshot) expect(await client.request({ method: "evm_revert" as any, params: [suiteSnapshot] } as any)).toBe(true);
    }
  });

  it("lets community read public comments while keeping review issues private", async () => {
    const preview = await api().get(`/v1/fundtogether/public/campaigns/${id}`);
    expect(preview.status).toBe(200); expect(preview.body).toMatchObject({ status: "COMMUNITY_REVIEW", budgetPlan: "Art, editing and design time.", evidencePlan: "Page proofs and complete PDF." });
    expect(JSON.stringify(preview.body)).not.toMatch(/ipDeclaration|objectId|userId|payoutWallet/);
    const body = { targetHash: commitment, kind: "COMMENT", body: "Please inspect the promised chapter count." };
    expect((await api().post(route("feedback")).send(body)).status).toBe(403);
    expect((await api().post(route("feedback")).set("x-test-user", owner).send(body)).status).toBe(403);
    expect((await api().post(route("feedback")).set("x-test-user", stranger).send({ ...body, shipping: {} })).status).toBe(400);
    const firstFeedback = await api().post(route("feedback")).set("x-test-user", stranger).send(body);
    expect(firstFeedback.status).toBe(201);
    expect((await api().post(route("feedback")).set("x-test-user", stranger).send(body)).status).toBe(201);
    expect((await api().post(route("feedback")).set("x-test-user", stranger).send({ ...body, body: "An additional comment preserves the original submission" })).status).toBe(201);
    const privateIssue = { targetHash: commitment, kind: "ISSUE", body: "The production plan needs a private correction." };
    expect((await api().post(route("feedback")).set("x-test-user", stranger).send(privateIssue)).status).toBe(201);
    expect((await api().get(route("feedback")).set("x-test-user", owner)).body).toMatchObject({ canSubmit: false, canRespond: true });
    expect((await api().get(route("feedback")).set("x-test-user", resolver)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ authorUserId: stranger, body: body.body })]));
    expect((await api().get(route("feedback")).set("x-test-user", backer)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ authorUserId: "COMMUNITY_MEMBER", kind: "COMMENT", body: body.body })]));
    expect((await api().get(route("feedback")).set("x-test-user", backer)).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: privateIssue.body })]));
    const creatorResponse = await api().post(`${route("feedback")}/responses`).set("x-test-user", owner).send({
      responseBody: "Cảm ơn góp ý; tôi đã cập nhật kế hoạch.", relatedFeedbackIds: [firstFeedback.body.id],
    });
    expect(creatorResponse.status).toBe(201);
    expect(creatorResponse.body).toMatchObject({ campaignId: id, creatorUserId: owner, responseBody: "Cảm ơn góp ý; tôi đã cập nhật kế hoạch.", relatedFeedbackIds: [firstFeedback.body.id] });
    expect((await api().get(route("feedback")).set("x-test-user", owner)).body.responses).toEqual([
      expect.objectContaining({ id: creatorResponse.body.id, responseBody: "Cảm ơn góp ý; tôi đã cập nhật kế hoạch.", relatedFeedbackIds: [firstFeedback.body.id] }),
    ]);
    expect((await api().get(route("feedback")).set("x-test-user", stranger)).body.responses).toEqual([
      expect.objectContaining({ id: creatorResponse.body.id, relatedFeedbackIds: [firstFeedback.body.id] }),
    ]);
    expect((await api().get(route("feedback")).set("x-test-user", owner)).body.canRespond).toBe(false);
    expect((await api().post(`${route("feedback")}/responses`).set("x-test-user", stranger).send({ responseBody: "A community member cannot impersonate the Creator." })).status).toBe(403);
    await db.insert(schema.campaignFeedback).values({ campaignId: id, authorUserId: stranger, targetHash: `0x${"2".repeat(64)}`, kind: "COMMENT", body: "Feedback from an older frozen submission.", bodyHash: "older-feedback-hash" });
    expect((await api().get(route("feedback")).set("x-test-user", resolver)).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ body: "Feedback from an older frozen submission." })]));
    expect((await api().get(`/v1/fundtogether/public/campaigns/${id}`)).body.feedbackCount).toBe(2);
  });

  it("publication requires independent exact-hash approval and verified creator; community cannot publish", async () => {
    expect((await api().get(route("publication-terms")).set("x-test-user", stranger)).status).toBe(403);
    expect((await api().get(route("publication-terms")).set("x-test-user", owner)).status).toBe(409);
    const [campaign] = await db.update(schema.campaigns).set({ status: "APPROVED" }).where(eq(schema.campaigns.id, id)).returning();
    expect((await api().get("/v1/fundtogether/public/campaigns/activation")).body).toEqual([expect.objectContaining({ id, status: "APPROVED", surface: "ACTIVATION_PENDING" })]);
    expect((await api().get("/v1/fundtogether/public/campaigns/funding")).body).toEqual([]);
    expect((await api().get(route("publication-terms")).set("x-test-user", owner)).status).toBe(409);
    await db.insert(schema.campaignReviews).values({ campaignId: id, resolverUserId: resolver, outcome: "APPROVED", decisionReason: "Reviewed terms and community report", commitmentHash: commitment, frozenSnapshot: campaign.frozenSnapshot });
    const creatorOperations = await api().get("/v1/fundtogether/campaigns/operations/creator").set("x-test-user", owner);
    expect(creatorOperations.status).toBe(200);
    expect(creatorOperations.body).toEqual([expect.objectContaining({ campaignId: id, applicationStatus: "APPROVED", publicationStatus: "NOT_PUBLISHED", onchainCampaignId: null, contractState: null })]);
    expect(JSON.stringify(creatorOperations.body)).not.toMatch(/ipDeclaration|objectId|payoutWallet|samples/);
    expect((await api().get("/v1/fundtogether/campaigns/operations/resolver").set("x-test-user", stranger)).status).toBe(403);
    expect((await api().get("/v1/fundtogether/campaigns/operations/admin").set("x-test-user", resolver)).status).toBe(200);
    const terms = await api().get(route("publication-terms")).set("x-test-user", owner);
    expect(terms.status).toBe(200); expect(terms.body).toMatchObject({ creatorWallet: accounts[3], commitmentHash: commitment, price: "10000000", onchainApproved: false });
    await db.update(schema.creatorProfiles).set({ status: "REJECTED" }).where(eq(schema.creatorProfiles.userId, owner));
    expect((await api().get(route("publication-terms")).set("x-test-user", resolver)).status).toBe(409);
    await db.update(schema.creatorProfiles).set({ status: "VERIFIED" }).where(eq(schema.creatorProfiles.userId, owner));
    approvalHash = await send(accounts[1], "approveCampaign", [accounts[3], commitment, 10000000n, 10000000n, 86400n]);
    expect((await api().post("/v1/fundtogether/campaigns/sync-receipt").set("x-test-user", resolver)
      .send({ txHash: approvalHash, campaignId: id, action: "createCampaign" })).body.state).toBe("UNRELATED");
    expect((await api().post("/v1/fundtogether/campaigns/sync-receipt").set("x-test-user", resolver)
      .send({ txHash: approvalHash, campaignId: id, action: "approveCampaign" })).body.state).toBe("ON_CHAIN_CONFIRMED");
    const approvedTerms = await api().get(route("publication-terms")).set("x-test-user", owner);
    expect(approvedTerms.status).toBe(200); expect(approvedTerms.body.onchainApproved).toBe(true);
    creationHash = await send(accounts[3], "createCampaign", [commitment, 10000000n, 10000000n, 86400n]);
    expect((await api().post("/v1/fundtogether/campaigns/sync-receipt").set("x-test-user", owner)
      .send({ txHash: creationHash, campaignId: id, action: "createCampaign" })).body.state).toBe("ON_CHAIN_CONFIRMED");
    const canonicalOperations = await api().get("/v1/fundtogether/campaigns/operations/creator").set("x-test-user", owner);
    expect(canonicalOperations.body[0]).toMatchObject({ campaignId: id, publicationStatus: "ON_CHAIN_CONFIRMED", onchainCampaignId: "0", contractState: 0, bindingTransactionHash: creationHash });
    expect((await db.select({ onchainCampaignId: schema.campaigns.onchainCampaignId }).from(schema.campaigns).where(eq(schema.campaigns.id, id)))[0].onchainCampaignId).toBeNull();
    await db.update(schema.campaigns).set({ status: "PUBLISHED" }).where(eq(schema.campaigns.id, id));
    expect((await api().get("/v1/fundtogether/public/campaigns/funding")).body).toEqual([expect.objectContaining({ id, status: "PUBLISHED", surface: "FUNDING" })]);
    const publishedChain = await api().get(route("chain"));
    expect(publishedChain.status).toBe(200);
    expect(publishedChain.body).toMatchObject({ status: "ON_CHAIN_CONFIRMED", onchainCampaignId: "0", snapshot: { state: 0 } });
    await db.update(schema.campaigns).set({ status: "APPROVED" }).where(eq(schema.campaigns.id, id));
    beforePledge = await client.request({ method: "evm_snapshot" as any }) as string;
    pledgeHash = await send(accounts[4], "pledge", [0n, 1n]);
    expect((await api().post("/v1/fundtogether/campaigns/sync-receipt").set("x-test-user", backer)
      .send({ txHash: pledgeHash, campaignId: id, action: "createCampaign" })).body.state).toBe("UNRELATED");
    expect((await api().post("/v1/fundtogether/campaigns/sync-receipt").set("x-test-user", backer)
      .send({ txHash: pledgeHash, campaignId: id, action: "pledge" })).body.state).toBe("ON_CHAIN_CONFIRMED");
    expect((await api().get("/v1/fundtogether/public/campaigns/funding")).body).toEqual([expect.objectContaining({ id, status: "APPROVED", surface: "FUNDING" })]);
    expect((await api().get("/v1/fundtogether/public/campaigns/activation")).body).toEqual([]);
    entitlementId = (await db.select().from(schema.campaignEntitlements))[0].id;
    expect((await ticket()).status).toBe(409);
    expect((await ticket(stranger)).status).toBe(404);
  });

  it("requires funding and distinct production review before final PDF submission", async () => {
    expect((await upload("PRODUCTION_EVIDENCE")).status).toBe(409);
    await client.request({ method: "evm_increaseTime" as any, params: [86401] } as any);
    await send(accounts[1], "finalizeFunding", [0n]);
    await sync();
    expect((await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: `0x${"3".repeat(64)}`, body: "This target is not part of the current review." })).status).toBe(409);
    const opened = await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: commitment, body: "Please clarify the production evidence timeline." });
    expect(opened.status).toBe(201);
    threadId = opened.body.id;
    expect((await api().get(route("review-threads")).set("x-test-user", owner)).body).toEqual([expect.objectContaining({ id: threadId })]);
    expect((await api().get(route("review-threads")).set("x-test-user", backer)).body).toEqual([expect.objectContaining({ id: threadId })]);
    const duplicate = await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: commitment, body: "Please clarify the production evidence timeline." });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).toBe(threadId);
    expect((await api().get(`/v1/fundtogether/campaigns/review-threads/${threadId}`).set("x-test-user", owner)).status).toBe(200);
    expect((await api().get(`/v1/fundtogether/campaigns/review-threads/${threadId}`).set("x-test-user", stranger)).status).toBe(403);
    const creatorMessage = await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/messages`).set("x-test-user", owner).send({ body: "Tôi sẽ bổ sung mốc kiểm tra trong hồ sơ sản xuất." });
    expect(creatorMessage.status).toBe(201);
    const backerMessage = await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/messages`).set("x-test-user", backer).send({ body: "Cảm ơn, tôi sẽ theo dõi mốc cập nhật này." });
    expect(backerMessage.status).toBe(201);
    const detail = await api().get(`/v1/fundtogether/campaigns/review-threads/${threadId}`).set("x-test-user", backer);
    expect(detail.status).toBe(200);
    expect(detail.body.messages).toHaveLength(3);
    expect(detail.body.messages.map((message: any) => message.authorRole)).toEqual(["BACKER", "CREATOR", "BACKER"]);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/messages`).set("x-test-user", stranger).send({ body: "Unauthorized message attempt." })).status).toBe(403);
    const beforeFinancial = (await db.select({ canonical: schema.campaignEntitlements.canonical, refunded: schema.campaignEntitlements.refunded }).from(schema.campaignEntitlements).where(eq(schema.campaignEntitlements.id, entitlementId)))[0];
    const beforeChainState = (await db.select().from(schema.campaignChainCampaigns).where(eq(schema.campaignChainCampaigns.campaignId, id)))[0].snapshot.state;
    const escalated = await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/escalate`).set("x-test-user", backer).send({ reason: "The Creator has not explained the production evidence timeline clearly." });
    expect(escalated.status).toBe(201);
    escalationId = escalated.body.id;
    expect(escalated.body.status).toBe("OPEN");
    const duplicateEscalation = await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/escalate`).set("x-test-user", backer).send({ reason: "The Creator has not explained the production evidence timeline clearly." });
    expect(duplicateEscalation.status).toBe(201);
    expect(duplicateEscalation.body.id).toBe(escalationId);
    expect((await api().get("/v1/fundtogether/campaigns/resolver/review-cases").set("x-test-user", stranger)).status).toBe(403);
    const cases = await api().get("/v1/fundtogether/campaigns/resolver/review-cases").set("x-test-user", resolver);
    expect(cases.status).toBe(200);
    expect(cases.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: escalationId, thread: expect.objectContaining({ id: threadId }) })]));
    const caseDetail = await api().get(`/v1/fundtogether/campaigns/resolver/review-cases/${escalationId}`).set("x-test-user", resolver);
    expect(caseDetail.status).toBe(200);
    expect(caseDetail.body.campaign).toMatchObject({ id, commitmentHash: commitment });
    expect(caseDetail.body.entitlement).toMatchObject({ id: entitlementId, canonical: true, refunded: false });
    expect(caseDetail.body.thread.messages).toHaveLength(3);
    expect((await api().post(`/v1/fundtogether/campaigns/review-escalations/${escalationId}/request-creator-response`).set("x-test-user", resolver).send({ body: "Creator, vui lòng làm rõ mốc bằng chứng sản xuất trong hồ sơ." })).status).toBe(201);
    expect((await api().post(`/v1/fundtogether/campaigns/review-escalations/${escalationId}/resolve`).set("x-test-user", resolver).send({ outcome: "DISMISSED", note: "Resolver ghi nhận phần giải thích đã đủ rõ để tiếp tục theo dõi." })).status).toBe(201);
    expect((await api().post(`/v1/fundtogether/campaigns/review-escalations/${escalationId}/resolve`).set("x-test-user", resolver).send({ outcome: "RESOLVED", note: "" })).status).toBe(400);
    const seededReviewMessages = Array.from({ length: 50 }, (_, index) => ({
      threadId,
      authorUserId: owner,
      authorRole: "CREATOR" as const,
      body: `Historical review message ${index.toString().padStart(2, "0")} for pagination coverage.`,
    }));
    await db.insert(schema.reviewMessages).values(seededReviewMessages);
    await db.update(schema.reviewThreads).set({ messageCount: 54 }).where(eq(schema.reviewThreads.id, threadId));
    const firstMessagePage = await api().get(`/v1/fundtogether/campaigns/review-threads/${threadId}`).set("x-test-user", backer);
    expect(firstMessagePage.status).toBe(200);
    expect(firstMessagePage.body.messages).toHaveLength(50);
    expect(firstMessagePage.body.hasMore).toBe(true);
    expect(firstMessagePage.body.nextCursor).toEqual(expect.any(String));
    const olderMessagePage = await api().get(`/v1/fundtogether/campaigns/review-threads/${threadId}`).set("x-test-user", backer)
      .query({ cursor: firstMessagePage.body.nextCursor });
    expect(olderMessagePage.status).toBe(200);
    expect(olderMessagePage.body.messages).toHaveLength(4);
    expect(olderMessagePage.body.hasMore).toBe(false);
    const firstPageIds = new Set(firstMessagePage.body.messages.map((message: any) => message.id));
    expect(olderMessagePage.body.messages.every((message: any) => !firstPageIds.has(message.id))).toBe(true);
    await db.update(schema.reviewThreads).set({ messageCount: 200 }).where(eq(schema.reviewThreads.id, threadId));
    const cappedMessage = await api().post(`/v1/fundtogether/campaigns/review-threads/${threadId}/messages`).set("x-test-user", owner)
      .send({ body: "This message must be rejected once the review thread reaches its resource cap." });
    expect(cappedMessage.status).toBe(409);
    expect(cappedMessage.body.message).toBe("Review thread message limit reached");
    expect((await db.select({ canonical: schema.campaignEntitlements.canonical, refunded: schema.campaignEntitlements.refunded }).from(schema.campaignEntitlements).where(eq(schema.campaignEntitlements.id, entitlementId)))[0]).toEqual(beforeFinancial);
    expect((await db.select().from(schema.campaignChainCampaigns).where(eq(schema.campaignChainCampaigns.campaignId, id)))[0].snapshot.state).toBe(beforeChainState);
    expect((await upload("PRODUCTION_EVIDENCE", png, "image/png", stranger)).status).toBe(403);
    expect((await upload("FINAL_PDF", pdf, "application/pdf")).status).toBe(409);
    const result = await upload("PRODUCTION_EVIDENCE"); expect(result.status).toBe(201); production = result.body;
    expect(JSON.stringify(production)).not.toMatch(/objectId|ownerUserId|originals\//);
    await send(accounts[3], "submitProduction", [0n, production.evidenceHash]);
    await sync();
    expect((await upload("PRODUCTION_EVIDENCE")).status).toBe(409);
    expect((await api().get(route(`evidence/${production.id}/file`)).set("x-test-user", resolver)).status).toBe(200);
    expect((await api().get(route(`evidence/${production.id}/file`)).set("x-test-user", backer)).status).toBe(403);
    await send(accounts[1], "reviewProduction", [0n, production.evidenceHash, true]);
    await send(accounts[3], "confirmCampaignCompletion", [0n, deadline]);
    await sync();
    expect((await ticket()).status).toBe(409);
  });

  it("rejects non-PDF, broken or physical payloads and binds final bytes to accepted production", async () => {
    expect((await upload("FINAL_PDF")).status).toBe(400);
    expect((await upload("FINAL_PDF", Buffer.from("%PDF-1.7\nbroken\n%%EOF"), "application/pdf")).status).toBe(400);
    expect((await upload("PHYSICAL_ITEM")).status).toBe(400);
    expect((await api().post(route("evidence")).set("x-test-user", owner).field("purpose", "FINAL_PDF").field("summary", "A final digital PDF for review.").field("address", "forbidden").attach("file", pdf, { filename: "comic.pdf", contentType: "application/pdf" })).status).toBe(400);
    const result = await upload("FINAL_PDF", pdf, "application/pdf"); expect(result.status).toBe(201); finalPdf = result.body;
    expect(finalPdf.productionHash).toBe(production.evidenceHash);
    expect((await upload("FINAL_PDF", pdf, "application/pdf")).body.id).toBe(finalPdf.id);
    await send(accounts[3], "submitRelease", [0n, finalPdf.sha256, finalPdf.evidenceHash]);
    await sync();
    expect((await ticket()).status).toBe(409);
    expect((await upload("FINAL_PDF", pdf, "application/pdf")).status).toBe(409);
    const published = await api().get(`/v1/fundtogether/public/campaigns/${id}/evidence`);
    expect(published.status).toBe(200); expect(published.body).toHaveLength(2);
    expect(JSON.stringify(published.body)).not.toMatch(/objectId|originals\/|url|ownerUserId/);
    await send(accounts[1], "reviewRelease", [0n, finalPdf.sha256, finalPdf.evidenceHash, true]);
    await sync();
  });

  it("serves the exact private PDF only to the owning account, with expiring access but no implied acceptance", async () => {
    const result = await ticket(); expect(result.status).toBe(201); expect(result.body.state).toBe("DOWNLOAD_AVAILABLE");
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect((await api().get(result.body.url)).status).toBe(403);
    expect((await api().get(result.body.url).set("x-test-user", stranger)).status).toBe(404);
    const download = await api().get(result.body.url).set("x-test-user", backer);
    expect(download.status).toBe(200); expect(download.body).toEqual(pdf);
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect((await db.select().from(schema.campaignEntitlements))[0].confirmedAt).toBeNull();
    const [audit] = await db.select().from(schema.downloadTickets);
    expect(audit.requestedAt).not.toBeNull(); expect(JSON.stringify(audit)).not.toContain(result.body.url.split("/").pop());
    await db.update(schema.downloadTickets).set({ expiresAt: new Date(0) });
    expect((await api().get(result.body.url).set("x-test-user", backer)).status).toBe(404);
    expect((await ticket()).status).toBe(201);
  });

  it("keeps post-approval release and challenge feedback attached to canonical on-chain targets", async () => {
    const report = {
      targetHash: finalPdf.evidenceHash,
      kind: "ISSUE",
      body: "The accepted release needs a closer content review.",
    };
    expect((await api().post(route("feedback")).set("x-test-user", backer).send(report)).status).toBe(201);

    const challengeHash = `0x${"4".repeat(64)}`;
    await send(accounts[4], "challengeRelease", [0n, challengeHash]);
    await sync();
    const decision = {
      targetHash: challengeHash,
      kind: "COMMENT",
      body: "Resolver reviewed the canonical challenge evidence.",
    };
    expect((await api().post(route("feedback")).set("x-test-user", resolver).send(decision)).status).toBe(201);
    expect((await api().get(route("feedback")).set("x-test-user", resolver)).body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetHash: finalPdf.evidenceHash, body: report.body }),
      expect.objectContaining({ targetHash: challengeHash, body: decision.body }),
    ]));
    await send(accounts[1], "resolveChallenge", [0n, accounts[4], false, `0x${"5".repeat(64)}`]);
    await sync();
  });

  it("does not advertise a downloadable benefit when canonical PDF metadata is missing", async () => {
    await db.update(schema.campaignEvidence).set({ purpose: "PRODUCTION_EVIDENCE" }).where(eq(schema.campaignEvidence.id, finalPdf.id));
    expect((await api().get("/v1/fundtogether/campaigns/entitlements").set("x-test-user", backer)).body[0]).toMatchObject({ access: "DELIVERY_UNAVAILABLE" });
    await db.update(schema.campaignEvidence).set({ purpose: "FINAL_PDF" }).where(eq(schema.campaignEvidence.id, finalPdf.id));
    expect((await api().get("/v1/fundtogether/campaigns/entitlements").set("x-test-user", backer)).body[0]).toMatchObject({ access: "DOWNLOAD_ELIGIBLE" });
  });

  it("records corrupted/missing file as a review issue without changing contract state or marking delivery", async () => {
    const [stored] = await db.select().from(schema.campaignEvidence).where(eq(schema.campaignEvidence.id, finalPdf.id));
    await storage.put(stored.objectId, Buffer.from("corrupt"), "application/pdf");
    expect((await ticket()).status).toBe(503);
    expect((await ticket()).status).toBe(503);
    const reports = await api().get(route("feedback")).set("x-test-user", resolver);
    expect(reports.body.items.filter((item: any) => item.kind === "FILE_UNAVAILABLE")).toHaveLength(1);
    expect((await db.select().from(schema.campaignChainCampaigns))[0].snapshot.state).toBe(3);
    expect((await db.select().from(schema.campaignEntitlements))[0].confirmedAt).toBeNull();
    await storage.put(stored.objectId, pdf, "application/pdf");
  });

  it("invalidates an issued link after refund, and restores rights only after canonical replay", async () => {
    const before = await ticket(); expect(before.status).toBe(201);
    const staleThread = await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: production.evidenceHash, body: "Please keep this production concern visible in the review history." });
    expect(staleThread.status).toBe(201);
    staleThreadId = staleThread.body.id;
    const staleEscalation = await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/escalate`).set("x-test-user", backer).send({ reason: "Keep this historical issue available to the Resolver." });
    expect(staleEscalation.status).toBe(201);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/messages`).set("x-test-user", owner).send({ body: "I will keep the production evidence available for audit." })).status).toBe(201);
    const beforeInvalidatedMessages = await db.select().from(schema.reviewMessages).where(eq(schema.reviewMessages.threadId, staleThreadId));
    const beforeInvalidatedEscalations = await db.select().from(schema.reviewEscalations).where(eq(schema.reviewEscalations.threadId, staleThreadId));
    const fork = await client.request({ method: "evm_snapshot" as any });
    await send(accounts[3], "cancelCampaign", [0n]);
    await sync();
    expect((await api().get(before.body.url).set("x-test-user", backer)).status).toBe(409);
    expect((await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: commitment, body: "A refunding campaign must not open another review thread." })).status).toBe(409);
    await send(accounts[4], "claimRefund", [0n]);
    await sync();
    expect((await ticket()).status).toBe(409);
    expect((await api().get("/v1/fundtogether/campaigns/entitlements").set("x-test-user", backer)).body[0]).toMatchObject({ access: "REFUNDED", campaignTitle: expect.any(String) });
    const refundedThreadForBacker = await api().get(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}`).set("x-test-user", backer);
    expect(refundedThreadForBacker.status).toBe(200);
    expect(refundedThreadForBacker.body.permissions).toEqual({ canMessage: false, canEscalate: false, readOnlyReason: "REFUNDED" });
    const refundedThreadForCreator = await api().get(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}`).set("x-test-user", owner);
    expect(refundedThreadForCreator.status).toBe(200);
    expect(refundedThreadForCreator.body.permissions).toEqual({ canMessage: false, canEscalate: false, readOnlyReason: "REFUNDED" });
    expect((await api().get(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}`).set("x-test-user", resolver)).status).toBe(200);
    expect((await api().post(`/v1/fundtogether/campaigns/review-escalations/${staleEscalation.body.id}/request-creator-response`).set("x-test-user", resolver).send({ body: "A refunded thread must not accept a new Resolver response request." })).status).toBe(409);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/messages`).set("x-test-user", backer).send({ body: "A refunded thread must not accept new Backer messages." })).status).toBe(409);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/messages`).set("x-test-user", owner).send({ body: "A refunded thread must not accept new Creator messages." })).status).toBe(409);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/escalate`).set("x-test-user", backer).send({ reason: "A refunded thread must not create a new Resolver case." })).status).toBe(409);
    expect(await db.select().from(schema.reviewMessages).where(eq(schema.reviewMessages.threadId, staleThreadId))).toHaveLength(beforeInvalidatedMessages.length);
    expect(await db.select().from(schema.reviewEscalations).where(eq(schema.reviewEscalations.threadId, staleThreadId))).toHaveLength(beforeInvalidatedEscalations.length);
    expect(await client.request({ method: "evm_revert" as any, params: [fork] } as any)).toBe(true);
    await client.request({ method: "evm_mine" as any }); await sync();
    expect((await ticket()).status).toBe(201);
  });

  it("keeps download, optional backer confirmation and protected payout as separate transitions", async () => {
    const confirmation = await api().post(`/v1/fundtogether/campaigns/entitlements/${entitlementId}/confirm`).set("x-test-user", backer).send({});
    expect(confirmation.status).toBe(201); expect(confirmation.body.state).toBe("BACKER_CONFIRMED");
    await client.request({ method: "evm_increaseTime" as any, params: [7 * 86400 + 1] } as any);
    await sync();
    expect((await ticket()).status).toBe(201);
    expect(campaignAbi.some(item => item.type === "function" && item.name === "payout")).toBe(false);
    expect((await db.select().from(schema.campaignChainCampaigns))[0].snapshot).toMatchObject({ state: 3, escrowed: "10000000" });
    expect((await upload("FINAL_PDF", pdf, "application/pdf")).status).toBe(409);
  });

  it("a reorg that orphans the pledge invalidates an already issued link and hides old confirmation", async () => {
    const issued = await ticket(); expect(issued.status).toBe(201);
    expect(await client.request({ method: "evm_revert" as any, params: [beforePledge] } as any)).toBe(true);
    await client.request({ method: "evm_mine" as any });
    await sync();
    expect((await api().get(issued.body.url).set("x-test-user", backer)).status).toBe(409);
    const rights = await api().get("/v1/fundtogether/campaigns/entitlements").set("x-test-user", backer);
    expect(rights.body[0]).toMatchObject({ access: "ORPHANED", confirmedAt: null });
    expect((await api().post(route("review-threads")).set("x-test-user", backer).send({ targetHash: commitment, body: "An orphaned entitlement must not open review." })).status).toBe(409);
    const orphanedThread = await api().get(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}`).set("x-test-user", backer);
    expect(orphanedThread.status).toBe(200);
    expect(orphanedThread.body.permissions).toEqual({ canMessage: false, canEscalate: false, readOnlyReason: "ORPHANED" });
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/messages`).set("x-test-user", backer).send({ body: "An orphaned thread must not accept a new Backer message." })).status).toBe(409);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/messages`).set("x-test-user", owner).send({ body: "An orphaned thread must not accept a new Creator message." })).status).toBe(409);
    expect((await api().post(`/v1/fundtogether/campaigns/review-threads/${staleThreadId}/escalate`).set("x-test-user", backer).send({ reason: "An orphaned thread must not create a new Resolver case." })).status).toBe(409);
  });
});
