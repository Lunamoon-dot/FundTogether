import { Global, Module, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } from "viem";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";

dotenv.config({ path: path.resolve(__dirname, "../../../.local/reward/backend.env"), quiet: true, override: true } as any);
process.env.REWARD_RPC_URL = process.env.REWARD_RPC_URL || "http://127.0.0.1:9548";
process.env.NODE_ENV = "test";
// This suite drives runOnce/receipts explicitly, including reorg assertions.
process.env.REWARD_INDEXER_POLL_ENABLED = "false";

const testOrigin = "http://127.0.0.1:5173";

jest.mock("@nestjs/config", () => ({
  ConfigService: class ConfigService {
    get(key: string) {
      if (key === "authSessionCookieName") return "ft_session";
      if (key === "webOrigin") return testOrigin;
      return process.env[key];
    }
    getOrThrow(key: string) {
      if (key === "databaseUrl") return process.env.DATABASE_URL;
      if (key === "authChainId") return 31339;
      if (key === "authDomain") return "127.0.0.1";
      if (key === "webOrigin") return testOrigin;
      if (key === "authSessionCookieName") return "ft_session";
      return process.env[key];
    }
  },
  ConfigModule: class ConfigModule {
    static forRoot() {
      return { module: ConfigModule, providers: [], exports: [] };
    }
  },
}));

jest.mock("file-type", () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue({ mime: "image/png" }),
}));

import { RewardModule } from "./reward.module";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../modules/auth/auth.module";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { AuthService } from "../modules/auth/auth.service";
import { RewardIndexerService } from "./reward-indexer.service";
import { RewardCryptoService } from "./reward-crypto.service";

const configServiceProvider = {
  provide: "ConfigService",
  useValue: {
    get: (key: string) => {
      if (key === "authSessionCookieName") return "ft_session";
      if (key === "webOrigin") return testOrigin;
      return process.env[key];
    },
    getOrThrow: (key: string) => {
      if (key === "databaseUrl") return process.env.DATABASE_URL;
      if (key === "authChainId") return 31339;
      if (key === "authDomain") return "127.0.0.1";
      if (key === "webOrigin") return testOrigin;
      if (key === "authSessionCookieName") return "ft_session";
      return process.env[key];
    },
  },
};

const mockConfigServiceClass = {
  provide: require("@nestjs/config").ConfigService,
  useValue: configServiceProvider.useValue,
};

@Global()
@Module({
  providers: [configServiceProvider, mockConfigServiceClass],
  exports: [configServiceProvider, mockConfigServiceClass],
})
class GlobalConfigTestModule {}

@Module({
  imports: [GlobalConfigTestModule, DatabaseModule, AuthModule, RewardModule],
})
class RewardTestAppModule {}

const { seedLegacyCampaign } = require("../../scripts/reward/testing/legacy-campaign.cjs");
const { artifacts, policy, hashJson } = require("../../scripts/reward/generate-artifacts.cjs");

describe("Reward Crowdfunding Full-Stack NestJS HTTP Acceptance Suite", () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let db: NodePgDatabase<typeof schema>;
  let authService: AuthService;
  let indexerService: RewardIndexerService;
  let cryptoService: RewardCryptoService;
  let databaseAdmin: Client;
  let databaseCreated = false;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const databaseName = `fundtogether_reward_legacy_test_${process.pid}`;

  const rpcUrl = process.env.REWARD_RPC_URL!;
  const chain = defineChain({
    id: 31339,
    name: "FundTogether Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const rpcTransport = () => http(rpcUrl, { fetchOptions: { headers: { Connection: "close" } } });
  const publicClient = createPublicClient({ chain, transport: rpcTransport(), pollingInterval: 50 });

  let accounts: `0x${string}`[];
  let creatorWallet: `0x${string}`;
  let resolverWallet: `0x${string}`;
  let backupResolverWallet: `0x${string}`;
  let backerWallet: `0x${string}`;
  let intruderWallet: `0x${string}`;

  let tokenAddress: `0x${string}`;
  let rewardAddress: `0x${string}`;
  let suiteSnapshot: string | undefined;
  let rewardArtifact: any;
  let tokenArtifact: any;
  let policyHash: `0x${string}`;

  // Test identities
  let adminUserId: string;
  let adminSessionToken: string;
  let resolverUserId: string;
  let resolverSessionToken: string;
  let creatorUserId: string;
  let creatorSessionToken: string;
  let backerUserId: string;
  let backerSessionToken: string;
  let intruderUserId: string;
  let intruderSessionToken: string;

  // Domain entity IDs
  let creatorProfileId: string;
  let campaignId: string;
  let onchainCampaignId: bigint;
  let tier0Id: string;
  let tier1Id: string;
  let digitalEntitlementId: string;
  let physicalEntitlementId: string;

  const walletClients = new Map<string, any>();
  const wallet = (account: `0x${string}`) => {
    let client = walletClients.get(account);
    if (!client) {
      client = createWalletClient({ account, chain, transport: rpcTransport(), pollingInterval: 50 });
      walletClients.set(account, client);
    }
    return client;
  };
  const send = async (account: `0x${string}`, abi: any, address: `0x${string}`, functionName: string, args: any[]) => {
    const hash = await wallet(account).writeContract({ account, abi, address, functionName, args, chain });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 50 });
    expect(receipt.status).toBe("success");
    return receipt;
  };

  const post = (url: string) => request(app.getHttpServer()).post(url).set("Origin", testOrigin).set("Connection", "close");
  const get = (url: string) => request(app.getHttpServer()).get(url).set("Connection", "close");

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = "/postgres";
    databaseAdmin = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    await databaseAdmin.connect();
    await databaseAdmin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    url.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = url.toString();
    await require("../../scripts/reward/migrate-isolated.cjs").migrateRewardDatabase(path.resolve(__dirname, "../../.."), {
      databaseUrl: url.toString(), expectedDatabaseName: databaseName,
    });
    // 1. Get Anvil accounts
    accounts = (await (publicClient.request as any)({ method: "eth_accounts" })) as `0x${string}`[];
    expect(accounts.length).toBeGreaterThanOrEqual(5);
    expect(await (publicClient.request as any)({ method: "web3_clientVersion" })).toMatch(/anvil/i);
    suiteSnapshot = await (publicClient.request as any)({ method: "evm_snapshot", params: [] });
    [creatorWallet, resolverWallet, backupResolverWallet, backerWallet, intruderWallet] = accounts;

    // 2. Deploy Contracts
    const root = path.resolve(__dirname, "../../..");
    const loaded = artifacts(root);
    rewardArtifact = loaded.reward;
    tokenArtifact = loaded.token;
    policyHash = hashJson(policy);

    const deployContract = async (artifact: any, args: any[], deployer: `0x${string}`) => {
      const deployHash = await wallet(deployer).deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode.object,
        args,
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash, confirmations: 1, pollingInterval: 50 });
      return receipt.contractAddress!;
    };

    tokenAddress = await deployContract(tokenArtifact, [], creatorWallet);
    rewardAddress = await deployContract(
      rewardArtifact,
      [tokenAddress, resolverWallet, backupResolverWallet, policyHash],
      creatorWallet
    );
    process.env.REWARD_CONTRACT_ADDRESS = rewardAddress;

    // 3. Boot NestJS testing module
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [RewardTestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    db = app.get(DRIZZLE_DB);
    authService = app.get(AuthService);
    indexerService = app.get(RewardIndexerService);
    cryptoService = app.get(RewardCryptoService);

    indexerService.setClient(publicClient);
    indexerService.setContractAddress(rewardAddress);

    // 4. Fixtures belong only to the disposable test database, never the running app.
    const createTestUser = async (role?: "ADMIN" | "RESOLVER", linkedWallet?: `0x${string}`) => {
      const email = `test_${randomBytes(8).toString("hex")}@fundtogether.local`;
      const [u] = await db.insert(schema.users).values({ email }).returning();
      if (role) {
        await db.insert(schema.platformRoles).values({
          userId: u.id,
          roles: [role],
        });
      }
      if (linkedWallet) {
        await db.insert(schema.walletLinks).values({
          userId: u.id,
          chainId: "31339",
          address: linkedWallet.toLowerCase(),
          isPrimary: true,
        }).onConflictDoUpdate({
          target: [schema.walletLinks.chainId, schema.walletLinks.address],
          set: { userId: u.id },
        });
      }
      const session = await (authService as any).createSession(u.id);
      return { userId: u.id, sessionToken: session.token as string };
    };

    const admin = await createTestUser("ADMIN");
    adminUserId = admin.userId;
    adminSessionToken = admin.sessionToken;

    const res = await createTestUser("RESOLVER", resolverWallet);
    resolverUserId = res.userId;
    resolverSessionToken = res.sessionToken;

    const cr = await createTestUser(undefined, creatorWallet);
    creatorUserId = cr.userId;
    creatorSessionToken = cr.sessionToken;

    const bk = await createTestUser(undefined, backerWallet);
    backerUserId = bk.userId;
    backerSessionToken = bk.sessionToken;

    const intr = await createTestUser(undefined, intruderWallet);
    intruderUserId = intr.userId;
    intruderSessionToken = intr.sessionToken;
  }, 60000);

  afterAll(async () => {
    try {
      if (indexerService) {
        await indexerService.onModuleDestroy();
      }
      if (app) {
        const httpServer = app.getHttpServer();
        if (httpServer && typeof httpServer.close === "function" && httpServer.listening) {
          await new Promise<void>(resolve => httpServer.close(() => resolve()));
        }
        await app.close();
      }
      if (db && (db as any).$client) {
        await (db as any).$client.end().catch(() => undefined);
      }
      if (databaseCreated) {
        await databaseAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      }
      await databaseAdmin?.end();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    } finally {
      if (suiteSnapshot) {
        expect(await (publicClient.request as any)({ method: "evm_revert", params: [suiteSnapshot] })).toBe(true);
      }
    }
  });

  // =========================================================================
  // PRIORITY 1: HTTP-LEVEL ROLE AUTHORIZATION & ACCESS CONTROL (401 & 403)
  // =========================================================================
  describe("Priority 1: Role Authorization & Security Guards", () => {
    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await post("/v1/reward/creator/profile")
        .send({ displayName: "Test", bio: "Bio", ipDeclaration: "IP" });
      expect(res.status).toBe(401);
    });

    it("rejects regular backer from accessing Admin Creator Review with 403 Forbidden", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000001";
      const res = await post(`/v1/reward/admin/creators/${dummyId}/review`)
        .set("Cookie", `ft_session=${intruderSessionToken}`)
        .send({ outcome: "VERIFIED" });
      expect(res.status).toBe(403);
    });

    it("rejects regular backer from accessing Resolver Campaign Review with 403 Forbidden", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000002";
      const res = await post(`/v1/reward/resolver/campaigns/${dummyId}/review`)
        .set("Cookie", `ft_session=${intruderSessionToken}`)
        .send({ outcome: "APPROVED", decisionReason: "Unauthorized review" });
      expect(res.status).toBe(403);
    });

    it("rejects regular backer from accessing Resolver Dispute Resolution with 403 Forbidden", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000003";
      const res = await post(`/v1/reward/resolver/disputes/${dummyId}/resolve`)
        .set("Cookie", `ft_session=${intruderSessionToken}`)
        .send({ outcome: "RESOLVED_BACKER", resolutionNote: "Illegal resolve" });
      expect(res.status).toBe(403);
    });

  });

  // =========================================================================
  // PRIORITY 4: FLOW V1 - CREATOR IDENTITY & RIGHTS VERIFICATION
  // =========================================================================
  describe("Priority 4: Flow V1 - Creator Verification by Admin", () => {
    it("creator submits verification application", async () => {
      const res = await post("/v1/reward/creator/profile")
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({
          displayName: "Studio Neon Comics",
          bio: "Independent sci-fi comic publishing house founded in 2024.",
          ipDeclaration: "Original screenplay, lineart, and character designs registered under Vietnam Copyright Office #2026-NEON.",
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PENDING");
      creatorProfileId = res.body.id;
    });

    it("admin successfully reviews and verifies creator profile", async () => {
      const res = await post(`/v1/reward/admin/creators/${creatorProfileId}/review`)
        .set("Cookie", `ft_session=${adminSessionToken}`)
        .send({ outcome: "VERIFIED" });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("VERIFIED");
    });
  });

  // =========================================================================
  // PRIORITY 4: FLOW V2 - CAMPAIGN DRAFT, FREEZE & RESOLVER REVIEW
  // =========================================================================
  describe("Priority 4: Flow V2 - Campaign Drafting, Freezing & Resolver Approval", () => {
    it("loads an existing mixed-tier campaign fixture for legacy regression coverage", async () => {
      const legacyCampaign = await seedLegacyCampaign(db, schema, cryptoService, creatorUserId, {
          title: "Neon City Chronicles: Volume 1",
          pitch: "A 120-page cyberpunk graphic novel following underground couriers in Saigon 2088.",
          story: "Detailed production timeline, character sheets, offset printing budget, and delivery manifest.",
          category: "COMICS",
          goal: "4000000000", // 4,000 USDC
          fundingDuration: 2592000, // 30 days
          policyHash,
          tiers: [
            {
              title: "Digital PDF Edition",
              description: "High-resolution digital graphic novel + bonus wallpapers",
              price: "50000000", // 50 USDC
              maxQuantity: 500,
              isDigital: true,
              rewardItems: ["Digital PDF", "Wallpapers"],
            },
            {
              title: "Physical Hardcover Collector",
              description: "Full-color offset print hardcover + signed bookplate + sticker sheet",
              price: "100000000", // 100 USDC
              maxQuantity: 200,
              isDigital: false,
              rewardItems: ["Hardcover Book", "Signed Bookplate", "Sticker Sheet"],
            },
          ],
        });

      expect(legacyCampaign.status).toBe("DRAFT");
      expect(legacyCampaign.commitmentHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(legacyCampaign.tiers).toHaveLength(2);

      campaignId = legacyCampaign.id;
      tier0Id = legacyCampaign.tiers[0].id;
      tier1Id = legacyCampaign.tiers[1].id;
    });

    it("creator freezes campaign commitment", async () => {
      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/freeze`)
        .set("Cookie", `ft_session=${creatorSessionToken}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("FROZEN");
      expect(res.body.frozenAt).toBeDefined();
    });

    it("creator submits frozen campaign for Resolver review", async () => {
      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/submit-review`)
        .set("Cookie", `ft_session=${creatorSessionToken}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("UNDER_REVIEW");
    });

    it("resolver approves campaign budget and commitments", async () => {
      const res = await post(`/v1/reward/resolver/campaigns/${campaignId}/review`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({
          outcome: "APPROVED",
          decisionReason: "Printing quotation from reputable press reviewed; timeline and risk mitigation acceptable.",
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("APPROVED");
    });
  });

  // =========================================================================
  // PRIORITY 4: ON-CHAIN CAMPAIGN CREATION & REGISTRATION
  // =========================================================================
  describe("Priority 4: On-Chain Deployment & Registration Verification", () => {
    it("rejects registerOnchain with 400 when contract address or RPC is unconfigured", async () => {
      const savedEnvAddr = process.env.REWARD_CONTRACT_ADDRESS;
      delete process.env.REWARD_CONTRACT_ADDRESS;
      indexerService.setContractAddress("0x0000000000000000000000000000000000000000");

      try {
        const res = await post(`/v1/reward/creator/campaigns/${campaignId}/onchain`)
          .set("Cookie", `ft_session=${creatorSessionToken}`)
          .send({ onchainCampaignId: "0" });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/configured/i);
      } finally {
        process.env.REWARD_CONTRACT_ADDRESS = savedEnvAddr;
        indexerService.setContractAddress(rewardAddress);
      }
    });

    it("rejects registering invalid on-chain campaign ID", async () => {
      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/onchain`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({ onchainCampaignId: "999999" });
      expect(res.status).toBe(400);
    });

    it("registers valid on-chain campaign with matching commitmentHash, linked creator wallet, and txHash receipt", async () => {
      const [camp] = await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, campaignId));

      // An earlier draft can legitimately have the same frozen commitment. The
      // receipt must still be projected onto the campaign selected by this request.
      await db.insert(schema.rewardCampaigns).values({
        creatorUserId,
        title: `Archived duplicate ${randomBytes(4).toString("hex")}`,
        pitch: camp.pitch,
        story: camp.story,
        category: camp.category,
        commitmentHash: camp.commitmentHash,
        goal: camp.goal,
        fundingDuration: camp.fundingDuration,
        policyHash: camp.policyHash,
        status: "APPROVED",
      });

      const onchainTiers = [
        { price: 50_000_000n, maxQuantity: 500n, pledgedQuantity: 0n, isDigital: true },
        { price: 100_000_000n, maxQuantity: 200n, pledgedQuantity: 0n, isDigital: false },
      ];

      const createReceipt = await send(
        creatorWallet,
        rewardArtifact.abi,
        rewardAddress,
        "createCampaign",
        [camp.commitmentHash as `0x${string}`, 4_000_000_000n, 2592000n, onchainTiers]
      );

      const nextId = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "nextCampaignId",
      }) as bigint;
      onchainCampaignId = nextId - 1n;

      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/onchain`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({
          onchainCampaignId: onchainCampaignId.toString(),
          txHash: createReceipt.transactionHash,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PUBLISHED");
      expect(res.body.onchainCampaignId).toBe(onchainCampaignId.toString());

      const streamId = `REWARD:31339:${rewardAddress.toLowerCase()}`;
      const [projection] = await db.select().from(schema.rewardCampaignProjection)
        .where(and(
          eq(schema.rewardCampaignProjection.streamId, streamId),
          eq(schema.rewardCampaignProjection.onchainCampaignId, onchainCampaignId.toString())
        ));
      expect(projection.campaignMetadataId).toBe(campaignId);
    });
  });

  // =========================================================================
  // PRIORITY 2: INDEXER FILTERING & IDEMPOTENT PLEDGE PROCESSING
  // =========================================================================
  describe("Priority 2: Indexer Contract Log Filtering & Idempotency", () => {
    it("rejects event logs originating from a foreign unverified contract address", async () => {
      const foreignEvent = {
        eventName: "RewardPledged",
        args: {
          campaignId: onchainCampaignId,
          backer: backerWallet,
          tierId: 0n,
          quantity: 1n,
          amount: 50_000_000n,
        },
        transactionHash: "0x" + "1".repeat(64),
        logIndex: 0,
      };

      const result = await indexerService.processEvents(
        [foreignEvent as any],
        "0x" + "1".repeat(64),
        "0x000000000000000000000000000000000000dead",
        100n,
        ("0x" + "0".repeat(64)) as `0x${string}`
      );
      expect(result.entitlementsCreated).toBe(0);
    });

    it("processes live RewardPledged events via HTTP notify-pledge and idempotently creates entitlements with gated digital key", async () => {
      // Mint USDC to backer and approve contract
      await send(creatorWallet, tokenArtifact.abi, tokenAddress, "mint", [backerWallet, 10_000_000_000n]);
      await send(backerWallet, tokenArtifact.abi, tokenAddress, "approve", [rewardAddress, 10_000_000_000n]);

      // Pledge 1 digital tier (50 USDC) + 1 physical tier (100 USDC)
      const r1 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 0n, 1n]);
      const r2 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 1n, 1n]);

      const notify1 = await post("/v1/reward/backer/notify-pledge")
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({ txHash: r1.transactionHash });
      const notify2 = await post("/v1/reward/backer/notify-pledge")
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({ txHash: r2.transactionHash });
      expect(notify1.status).toBe(201);
      expect(notify2.status).toBe(201);

      // Verify entitlements in DB
      const entitlements = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.campaignId, campaignId));
      expect(entitlements).toHaveLength(2);

      const digitalEnt = entitlements.find(e => e.tierId === tier0Id);
      const physicalEnt = entitlements.find(e => e.tierId === tier1Id);
      expect(digitalEnt).toBeDefined();
      expect(physicalEnt).toBeDefined();
      expect(digitalEnt!.digitalAccessCode).toBeNull(); // GATED!
      expect(digitalEnt!.status).toBe("ACTIVE");

      digitalEntitlementId = digitalEnt!.id;
      physicalEntitlementId = physicalEnt!.id;

      // Idempotency: Re-processing identical receipt produces 0 duplicates
      const reprocess = await indexerService.processReceipt(r1.transactionHash);
      expect(reprocess.entitlementsCreated).toBe(0);
      const afterReprocess = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.campaignId, campaignId));
      expect(afterReprocess).toHaveLength(2);
    });
  });

  // =========================================================================
  // PRIORITY 3: BACKER SHIPPING DETAILS & AES-256-GCM ENCRYPTION
  // =========================================================================
  it("rejects retired physical endpoints for historical backers and creators", async () => {
    for (const actor of [backerSessionToken, creatorSessionToken, intruderSessionToken]) {
      for (const url of [
        `/v1/reward/backer/entitlements/${physicalEntitlementId}/shipping`,
        `/v1/reward/creator/entitlements/${physicalEntitlementId}/shipping`,
        `/v1/reward/creator/entitlements/${physicalEntitlementId}/delivered`,
        `/v1/reward/backer/entitlements/${physicalEntitlementId}/confirm`,
        `/v1/reward/creator/campaigns/${campaignId}/batches`,
      ]) {
        expect((await post(url).set("Cookie", `ft_session=${actor}`).send({ address: "Rejected physical data" })).status).toBe(404);
        expect((await get(url).set("Cookie", `ft_session=${actor}`)).status).toBe(404);
      }
    }
    const [row] = await db.select().from(schema.rewardEntitlements).where(eq(schema.rewardEntitlements.id, physicalEntitlementId));
    expect(Object.keys(row).some(key => /shipping|tracking|deliveredAt/i.test(key))).toBe(false);
  });

  // =========================================================================
  // PRIORITY 5: MILESTONE GATING & DIGITAL KEY ISSUANCE VIA HTTP RECEIPT SYNC
  // =========================================================================
  describe("Priority 5: Production Verification & Gated Digital Access Unlock", () => {
    it("digital access code is initially NULL before production verification", async () => {
      const res = await get("/v1/reward/backer/entitlements")
        .set("Cookie", `ft_session=${backerSessionToken}`);
      expect(res.status).toBe(200);
      const dig = res.body.find((e: any) => e.id === digitalEntitlementId);
      expect(dig.digitalAccessCode).toBeNull();
    });

    it("production verification via HTTP receipt endpoint unlocks digital access keys for digital tier backers", async () => {
      // 1. Backer pledges remainder via digital Tier 0 (77 x 50 USDC = 3,850 USDC) to hit 100% funding goal (4,000 USDC)
      const rRemain1 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 0n, 77n]);
      await post("/v1/reward/backer/notify-pledge")
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({ txHash: rRemain1.transactionHash });

      // 2. Resolver activates campaign on-chain and syncs via Resolver HTTP endpoint
      const actReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "activateCampaign", [
        onchainCampaignId,
        keccak256(toHex("comic-ready")),
      ]);
      const actHttpRes = await post(`/v1/reward/resolver/campaigns/${campaignId}/activate`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({ txHash: actReceipt.transactionHash });
      expect(actHttpRes.status).toBe(201);
      expect(actHttpRes.body.status).toBe("ACTIVE");

      // 3. Creator requests 500 USDC print deposit, resolver approves & syncs via public sync-receipt endpoint
      const reqHash = keccak256(toHex("deposit-req"));
      const subReceipt = await send(creatorWallet, rewardArtifact.abi, rewardAddress, "submitDisbursementRequest", [
        onchainCampaignId,
        reqHash,
        creatorWallet,
        500_000_000n,
      ]);
      const syncSub = await post("/v1/reward/public/sync-receipt").send({ txHash: subReceipt.transactionHash });
      expect(syncSub.status).toBe(201);

      const appReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "approveAndDisburse", [
        onchainCampaignId,
        0n,
        reqHash,
      ]);
      await post("/v1/reward/public/sync-receipt").send({ txHash: appReceipt.transactionHash });

      // 4. Settle invoice
      const candReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "candidateExpenditure", [
        onchainCampaignId,
        0n,
        500_000_000n,
        keccak256(toHex("invoice-proof")),
      ]);
      await post("/v1/reward/public/sync-receipt").send({ txHash: candReceipt.transactionHash });

      await (publicClient.request as any)({ method: "evm_increaseTime", params: [3 * 86400 + 1] });
      await (publicClient.request as any)({ method: "evm_mine" });
      const finReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "finalizeExpenditure", [onchainCampaignId, 0n]);
      await post("/v1/reward/public/sync-receipt").send({ txHash: finReceipt.transactionHash });

      // 5. Resolver records production verified on-chain and calls Resolver HTTP endpoint with txHash
      const prodProof = keccak256(toHex("printed-sample-books"));
      const prodReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "recordProductionVerified", [
        onchainCampaignId,
        prodProof,
      ]);

      const prodHttpRes = await post(`/v1/reward/resolver/campaigns/${campaignId}/production-verified`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({ txHash: prodReceipt.transactionHash, productionReportHash: prodProof });
      expect(prodHttpRes.status).toBe(201);
      expect(prodHttpRes.body.status).toBe("PRODUCTION_VERIFIED");
      expect(prodHttpRes.body.digitalKeysIssued).toBeGreaterThanOrEqual(1);

      // 6. Verify backer now receives unlocked digital access code
      const res = await get("/v1/reward/backer/entitlements")
        .set("Cookie", `ft_session=${backerSessionToken}`);
      expect(res.status).toBe(200);
      const dig = res.body.find((e: any) => e.id === digitalEntitlementId);
      expect(dig.digitalAccessCode).toMatch(/^COMIC-READ-[A-F0-9]{8}-\d{4}$/);
    });
  });

  // =========================================================================
  // PRIORITY 5: FULFILLMENT BATCH, DISPUTE RESOLUTION & STATE SEPARATION
  // =========================================================================
  describe("Priority 5: Fulfillment Batches, Dispute Resolution & State Separation", () => {
    let disputeId: string;

    it("backer opens dispute for physical package damage", async () => {
      const res = await post(`/v1/reward/backer/entitlements/${physicalEntitlementId}/dispute`)
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({
          reason: "Package crushed in transit; hardcover spine damaged.",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("OPEN");
      disputeId = res.body.id;
    });

    it("rejects the retired fulfillment attestation endpoint", async () => {
      const prematureRes = await post(`/v1/reward/resolver/campaigns/${campaignId}/fulfillment-complete`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({
          fulfillmentReportHash: "0x" + "3".repeat(64),
          txHash: "0x" + "4".repeat(64),
        });
      expect(prematureRes.status).toBe(404);
    });

    it("resolver resolves dispute in backer favor, unlocking REFUND_ELIGIBLE status", async () => {
      const res = await post(`/v1/reward/resolver/disputes/${disputeId}/resolve`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({
          outcome: "RESOLVED_BACKER",
          resolutionNote: "Photo evidence verified; damage severe. Refund approved.",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("RESOLVED_BACKER");

      const [ent] = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.id, physicalEntitlementId));
      expect(ent.status).toBe("REFUND_ELIGIBLE");
    });

    it("enforces state separation: premature completeCampaign on contract reverts", async () => {
      try {
        await publicClient.simulateContract({
          account: creatorWallet,
          abi: rewardArtifact.abi,
          address: rewardAddress,
          functionName: "completeCampaign",
          args: [onchainCampaignId],
        });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toMatch(/revert|WrongState/i);
      }
    });

    it("preserves historic completion events and financial synchronization after physical API retirement", async () => {
      const reportHash = "0x" + "3".repeat(64);

      // 1. On-chain recordFulfillmentComplete first
      const fulfillReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "recordFulfillmentComplete", [
        onchainCampaignId,
        reportHash as `0x${string}`,
      ]);

      // Historical event decoding is retained, without a physical workflow endpoint.
      await indexerService.processReceipt(fulfillReceipt.transactionHash);

      const onchainCamp = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "campaign",
        args: [onchainCampaignId],
      }) as any;
      expect(onchainCamp.state).toBe(3); // FULFILLMENT_COMPLETE

      // 3. Finalize campaign completion on-chain and via Creator HTTP endpoint
      const completeReceipt = await send(creatorWallet, rewardArtifact.abi, rewardAddress, "completeCampaign", [onchainCampaignId]);
      const completeHttpRes = await post(`/v1/reward/creator/campaigns/${campaignId}/complete`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({ txHash: completeReceipt.transactionHash });

      expect(completeHttpRes.status).toBe(201);
      expect(completeHttpRes.body.status).toBe("COMPLETED");

      const finalizedCamp = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "campaign",
        args: [onchainCampaignId],
      }) as any;
      expect(finalizedCamp.state).toBe(4); // COMPLETED
    });
  });

  // =========================================================================
  // PRIORITY 6: REORG ROLLBACK/REPLAY, CHECKPOINT INTEGRITY & WIND-DOWN REFUND
  // =========================================================================
  describe("Priority 6: Reorg Rollback/Replay, Block-Aligned Checkpoints, Wind-Down & Refund Claim", () => {
    it("invalidates orphaned events (canonical=false), rolls back orphaned entitlements/digital keys/projections on chain reorg, and indexes canonical wind-down & refund", async () => {
      // 1. Create, freeze, review & approve Campaign #2 with 1 digital tier and 1 physical tier
      const legacyCampaign = await seedLegacyCampaign(db, schema, cryptoService, creatorUserId, {
          title: "Wind-Down & Reorg Verification Comic Vol 2",
          pitch: "Testing canonical reorg rollback, wind-down, and pro-rata refund claim indexing.",
          story: "Detailed production schedule for volume 2.",
          category: "COMICS",
          goal: "1000000000", // 1,000 USDC
          fundingDuration: 2592000,
          policyHash: "0x" + "1".repeat(64),
          tiers: [
            {
              title: "Digital Edition",
              description: "Digital PDF edition",
              price: "1000000000",
              maxQuantity: 10,
              isDigital: true,
              rewardItems: ["Digital PDF"],
            },
          ],
        });
      const camp2Id = legacyCampaign.id;
      const camp2Tier0Id = legacyCampaign.tiers[0].id;

      const freezeRes = await post(`/v1/reward/creator/campaigns/${camp2Id}/freeze`)
        .set("Cookie", `ft_session=${creatorSessionToken}`);
      expect(freezeRes.status).toBe(201);
      const commitment2 = freezeRes.body.commitmentHash as `0x${string}`;

      await post(`/v1/reward/creator/campaigns/${camp2Id}/submit-review`)
        .set("Cookie", `ft_session=${creatorSessionToken}`);
      await post(`/v1/reward/resolver/campaigns/${camp2Id}/review`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({ outcome: "APPROVED", decisionReason: "Approved for reorg & wind-down test." });

      // 2. Deploy campaign #2 on-chain and register
      const create2Receipt = await send(
        creatorWallet,
        rewardArtifact.abi,
        rewardAddress,
        "createCampaign",
        [commitment2, 1_000_000_000n, 2592000n, [{ price: 1_000_000_000n, maxQuantity: 10n, pledgedQuantity: 0n, isDigital: true }]]
      );
      const nextId = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "nextCampaignId",
      }) as bigint;
      const onchainId2 = nextId - 1n;

      const regRes = await post(`/v1/reward/creator/campaigns/${camp2Id}/onchain`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({ onchainCampaignId: onchainId2.toString(), txHash: create2Receipt.transactionHash });
      expect(regRes.status).toBe(201);

      // 3. Backer pledges 1,000 USDC (1 unit of digital tier 0) and notifies backend
      const pledge2Receipt = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainId2, 0n, 1n]);
      const notifyRes = await post("/v1/reward/backer/notify-pledge")
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({ txHash: pledge2Receipt.transactionHash });
      expect(notifyRes.status).toBe(201);
      const ent2Id = notifyRes.body.entitlement.id;

      // 4. Sync up to current head while Campaign #2 is in PUBLISHED (on-chain FUNDING) with 1 pledge
      await indexerService.runOnce();

      // Verify stream checkpoint has exact block-aligned metadata
      const streamId = `REWARD:31339:${rewardAddress.toLowerCase()}`;
      const [streamBeforeFork] = await db.select().from(schema.indexerStreams)
        .where(eq(schema.indexerStreams.streamId, streamId));
      const headBlockBeforeFork = await publicClient.getBlock({ blockNumber: BigInt(streamBeforeFork.lastBlock!) });
      expect(streamBeforeFork.lastBlockHash?.toLowerCase()).toBe(headBlockBeforeFork.hash?.toLowerCase());

      // 5. Take Anvil snapshot BEFORE Fork A (while Campaign #2 is in FUNDING with 1 pledge)
      const snapshotId = await (publicClient.request as any)({ method: "evm_snapshot", params: [] });

      // Fork A: Backer makes an extra 2nd pledge (1 unit), Resolver activates AND calls recordProductionVerified
      const orphanPledgeReceipt = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainId2, 0n, 1n]);
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "activateCampaign", [
        onchainId2,
        keccak256(toHex("orphan-activate-2")),
      ]);
      const orphanProdReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "recordProductionVerified", [
        onchainId2,
        keccak256(toHex("orphan-sample-proof")),
      ]);

      // Index Fork A via background scanner runOnce()
      await indexerService.runOnce();

      // Verify Fork A state is in DB:
      // - 2 entitlements exist for camp2Id
      // - digitalAccessCode was unlocked on ent2Id
      // - campaign status is PRODUCTION_VERIFIED
      const entsOnForkA = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.campaignId, camp2Id));
      expect(entsOnForkA).toHaveLength(2);
      const ent2OnForkA = entsOnForkA.find(e => e.id === ent2Id)!;
      expect(ent2OnForkA.digitalAccessCode).toMatch(/^COMIC-READ-/);

      const [campOnForkA] = await db.select().from(schema.rewardCampaigns)
        .where(eq(schema.rewardCampaigns.id, camp2Id));
      expect(campOnForkA.status).toBe("PRODUCTION_VERIFIED");

      // 6. Simulate blockchain REORG: revert to snapshotId and on canonical Fork B only activate Campaign #2 + mine blocks
      await (publicClient.request as any)({ method: "evm_revert", params: [snapshotId] });
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "activateCampaign", [
        onchainId2,
        keccak256(toHex("canonical-activate-2")),
      ]);
      await (publicClient.request as any)({ method: "evm_mine" });
      await (publicClient.request as any)({ method: "evm_mine" });

      // Run background scanner -> detects block hash mismatch at checkpoint, marks Fork A events canonical=false, and rolls back!
      await indexerService.runOnce();

      // Verify Fork A events in chain_events are now canonical = false
      const [orphanPledgeEvent] = await db.select().from(schema.chainEvents)
        .where(and(
          eq(schema.chainEvents.streamId, streamId),
          eq(schema.chainEvents.transactionHash, orphanPledgeReceipt.transactionHash)
        ));
      expect(orphanPledgeEvent.canonical).toBe(false);

      const [orphanProdEvent] = await db.select().from(schema.chainEvents)
        .where(and(
          eq(schema.chainEvents.streamId, streamId),
          eq(schema.chainEvents.transactionHash, orphanProdReceipt.transactionHash)
        ));
      expect(orphanProdEvent.canonical).toBe(false);

      // Verify orphaned entitlement was removed, tier pledgedQuantity rolled back to 1, digitalAccessCode revoked to NULL, and status rolled back to ACTIVE!
      const entsAfterReorg = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.campaignId, camp2Id));
      expect(entsAfterReorg).toHaveLength(1);
      expect(entsAfterReorg[0].id).toBe(ent2Id);
      expect(entsAfterReorg[0].digitalAccessCode).toBeNull();

      const [tierAfterReorg] = await db.select().from(schema.rewardTiers)
        .where(eq(schema.rewardTiers.id, camp2Tier0Id));
      expect(tierAfterReorg.pledgedQuantity).toBe(1);

      const [campAfterReorg] = await db.select().from(schema.rewardCampaigns)
        .where(eq(schema.rewardCampaigns.id, camp2Id));
      expect(campAfterReorg.status).toBe("ACTIVE");

      const [projAfterReorg] = await db.select().from(schema.rewardCampaignProjection)
        .where(and(
          eq(schema.rewardCampaignProjection.streamId, streamId),
          eq(schema.rewardCampaignProjection.onchainCampaignId, onchainId2.toString())
        ));
      expect((projAfterReorg.snapshot as any).status).toBe("ACTIVE");
      expect((projAfterReorg.snapshot as any).onchainState).toBe(1);

      // 7. Now warp past EXECUTION_HORIZON (180 days) on the canonical chain and call startWindDown
      await (publicClient.request as any)({ method: "evm_increaseTime", params: [181 * 86400] });
      await (publicClient.request as any)({ method: "evm_mine" });
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "startWindDown", [onchainId2]);

      // Use background block scanner runOnce() (without passing txHash!) to index WindDownStarted
      const scanRes = await indexerService.runOnce();
      expect(scanRes.logsProcessed).toBeGreaterThanOrEqual(1);

      const [stoppedCamp] = await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, camp2Id));
      expect(stoppedCamp.status).toBe("STOPPED");

      const [eligibleEnt] = await db.select().from(schema.rewardEntitlements).where(eq(schema.rewardEntitlements.id, ent2Id));
      expect(eligibleEnt.status).toBe("REFUND_ELIGIBLE");

      // 8. Backer executes claimRefund on-chain and calls POST /v1/reward/backer/claim-refund
      const refundReceipt = await send(backerWallet, rewardArtifact.abi, rewardAddress, "claimRefund", [onchainId2]);
      const claimHttpRes = await post("/v1/reward/backer/claim-refund")
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({ txHash: refundReceipt.transactionHash });
      expect(claimHttpRes.status).toBe(201);
      expect(claimHttpRes.body.synced).toBe(true);

      const [refundedEnt] = await db.select().from(schema.rewardEntitlements).where(eq(schema.rewardEntitlements.id, ent2Id));
      expect(refundedEnt.status).toBe("REFUNDED");
    });
  });
});

