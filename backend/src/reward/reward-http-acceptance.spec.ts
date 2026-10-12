import { Global, Module, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } from "viem";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
process.env.REWARD_PII_ENCRYPTION_KEY = "test_reward_pii_encryption_key_32bytes_safe!!";
process.env.HED_BLOCKCHAIN_RPC_URL = process.env.HED_BLOCKCHAIN_RPC_URL || "http://127.0.0.1:9548";
process.env.NODE_ENV = "test";

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

const { artifacts, policy, hashJson } = require("../../scripts/reward/generate-artifacts.cjs");

describe("Reward Crowdfunding Full-Stack NestJS HTTP Acceptance Suite", () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let db: NodePgDatabase<typeof schema>;
  let authService: AuthService;
  let indexerService: RewardIndexerService;
  let cryptoService: RewardCryptoService;

  const rpcUrl = process.env.HED_BLOCKCHAIN_RPC_URL!;
  const chain = defineChain({
    id: 31339,
    name: "FundTogether Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  let accounts: `0x${string}`[];
  let creatorWallet: `0x${string}`;
  let resolverWallet: `0x${string}`;
  let backupResolverWallet: `0x${string}`;
  let backerWallet: `0x${string}`;
  let intruderWallet: `0x${string}`;

  let tokenAddress: `0x${string}`;
  let rewardAddress: `0x${string}`;
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

  const wallet = (account: `0x${string}`) => createWalletClient({ account, chain, transport: http(rpcUrl) });
  const send = async (account: `0x${string}`, abi: any, address: `0x${string}`, functionName: string, args: any[]) => {
    const hash = await wallet(account).writeContract({ abi, address, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    expect(receipt.status).toBe("success");
    return receipt;
  };

  const post = (url: string) => request(app.getHttpServer()).post(url).set("Origin", testOrigin);
  const get = (url: string) => request(app.getHttpServer()).get(url);

  beforeAll(async () => {
    // 1. Get Anvil accounts
    accounts = (await (publicClient.request as any)({ method: "eth_accounts" })) as `0x${string}`[];
    expect(accounts.length).toBeGreaterThanOrEqual(5);
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
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash, confirmations: 1 });
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

    // 4. Create isolated test user fixtures (additive only, ZERO destructive DELETE operations)
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
    if (app) await app.close();
    if (db && (db as any).$client) {
      await (db as any).$client.end();
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

    it("rejects regular backer from accessing Resolver Fulfillment Completion with 403 Forbidden", async () => {
      const dummyId = "00000000-0000-0000-0000-000000000004";
      const res = await post(`/v1/reward/resolver/campaigns/${dummyId}/fulfillment-complete`)
        .set("Cookie", `ft_session=${intruderSessionToken}`)
        .send({ fulfillmentReportHash: "0x" + "1".repeat(64) });
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
    it("creator creates draft with 2 tiers and computes commitmentHash", async () => {
      const res = await post("/v1/reward/creator/campaigns")
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({
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

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("DRAFT");
      expect(res.body.commitmentHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(res.body.tiers).toHaveLength(2);

      campaignId = res.body.id;
      tier0Id = res.body.tiers[0].id;
      tier1Id = res.body.tiers[1].id;
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
    it("rejects registering invalid on-chain campaign ID", async () => {
      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/onchain`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({ onchainCampaignId: "999999" });
      expect(res.status).toBe(400);
    });

    it("registers valid on-chain campaign with matching commitmentHash and linked creator wallet", async () => {
      const [camp] = await db.select().from(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.id, campaignId));

      const onchainTiers = [
        { price: 50_000_000n, maxQuantity: 500n, pledgedQuantity: 0n, isDigital: true },
        { price: 100_000_000n, maxQuantity: 200n, pledgedQuantity: 0n, isDigital: false },
      ];

      await send(
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
        .send({ onchainCampaignId: onchainCampaignId.toString() });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("PUBLISHED");
      expect(res.body.onchainCampaignId).toBe(onchainCampaignId.toString());
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

    it("processes live RewardPledged events and idempotently creates entitlements with gated digital key", async () => {
      // Mint USDC to backer and approve contract
      await send(creatorWallet, tokenArtifact.abi, tokenAddress, "mint", [backerWallet, 5_000_000_000n]);
      await send(backerWallet, tokenArtifact.abi, tokenAddress, "approve", [rewardAddress, 5_000_000_000n]);

      // Pledge 1 digital tier (50 USDC) + 1 physical tier (100 USDC)
      const r1 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 0n, 1n]);
      const r2 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 1n, 1n]);

      const idxRes1 = await indexerService.processReceipt(r1.transactionHash);
      const idxRes2 = await indexerService.processReceipt(r2.transactionHash);
      expect(idxRes1.entitlementsCreated).toBe(1);
      expect(idxRes2.entitlementsCreated).toBe(1);

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
  describe("Priority 3: Backer Shipping Address Privacy & Encryption", () => {
    it("encrypts shipping details with AES-256-GCM and stores ciphertext & masked phone", async () => {
      const res = await post(`/v1/reward/backer/entitlements/${physicalEntitlementId}/shipping`)
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({
          fullName: "Nguyen Van A",
          address: "Số 456 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
          phone: "+84901234567",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("REDEEM_REQUESTED");

      // Verify raw database row: plaintext address and full phone MUST NOT exist
      const [row] = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.id, physicalEntitlementId));
      expect(row.shippingEncrypted).toBeDefined();
      expect(row.shippingIv).toHaveLength(24);
      expect(row.shippingTag).toHaveLength(32);
      expect(row.shippingFullName).toBe("*** Protected ***");
      expect(row.shippingAddress).toContain("Encrypted");
      expect(row.shippingPhone).toBe("*** Protected ***");
    });

    it("rejects unauthorized user from reading decrypted shipping details with 403 Forbidden", async () => {
      const res = await get(`/v1/reward/creator/entitlements/${physicalEntitlementId}/shipping`)
        .set("Cookie", `ft_session=${intruderSessionToken}`);
      expect(res.status).toBe(403);
    });

    it("allows authorized creator to decrypt shipping details", async () => {
      const res = await get(`/v1/reward/creator/entitlements/${physicalEntitlementId}/shipping`)
        .set("Cookie", `ft_session=${creatorSessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Nguyen Van A");
      expect(res.body.address).toContain("Nguyễn Huệ");
      expect(res.body.phone).toBe("+84901234567");
    });
  });

  // =========================================================================
  // PRIORITY 5: MILESTONE GATING & DIGITAL KEY ISSUANCE
  // =========================================================================
  describe("Priority 5: Production Verification & Gated Digital Access Unlock", () => {
    it("digital access code is initially NULL before production verification", async () => {
      const res = await get("/v1/reward/backer/entitlements")
        .set("Cookie", `ft_session=${backerSessionToken}`);
      expect(res.status).toBe(200);
      const dig = res.body.find((e: any) => e.id === digitalEntitlementId);
      expect(dig.digitalAccessCode).toBeNull();
    });

    it("production verification unlocks digital access keys for digital tier backers", async () => {
      // 1. Backer pledges remainder to hit 100% funding goal (4,000 USDC)
      const rRemain1 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 0n, 19n]);
      const rRemain2 = await send(backerWallet, rewardArtifact.abi, rewardAddress, "pledge", [onchainCampaignId, 1n, 29n]);
      await indexerService.processReceipt(rRemain1.transactionHash);
      await indexerService.processReceipt(rRemain2.transactionHash);

      // 2. Resolver activates campaign on-chain
      const actReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "activateCampaign", [
        onchainCampaignId,
        keccak256(toHex("comic-ready")),
      ]);
      await indexerService.processReceipt(actReceipt.transactionHash);

      // 3. Creator requests 500 USDC print deposit, resolver approves
      const reqHash = keccak256(toHex("deposit-req"));
      await send(creatorWallet, rewardArtifact.abi, rewardAddress, "submitDisbursementRequest", [
        onchainCampaignId,
        reqHash,
        creatorWallet,
        500_000_000n,
      ]);
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "approveAndDisburse", [
        onchainCampaignId,
        0n,
        reqHash,
      ]);

      // 4. Settle invoice
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "candidateExpenditure", [
        onchainCampaignId,
        0n,
        500_000_000n,
        keccak256(toHex("invoice-proof")),
      ]);
      await (publicClient.request as any)({ method: "evm_increaseTime", params: [3 * 86400 + 1] });
      await (publicClient.request as any)({ method: "evm_mine" });
      await send(resolverWallet, rewardArtifact.abi, rewardAddress, "finalizeExpenditure", [onchainCampaignId, 0n]);

      // 5. Resolver records production verified on-chain
      const prodProof = keccak256(toHex("printed-sample-books"));
      const prodReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "recordProductionVerified", [
        onchainCampaignId,
        prodProof,
      ]);

      // 6. Indexer processes ProductionVerified event
      const prodIndexResult = await indexerService.processReceipt(prodReceipt.transactionHash);
      expect(prodIndexResult.digitalKeysIssued).toBeGreaterThanOrEqual(1);

      // 7. Verify backer now receives unlocked digital access code
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

    it("creator creates physical fulfillment batch", async () => {
      const res = await post(`/v1/reward/creator/campaigns/${campaignId}/batches`)
        .set("Cookie", `ft_session=${creatorSessionToken}`)
        .send({
          batchNumber: 1,
          title: "Batch 1 - Ho Chi Minh City Deliveries",
          carrier: "VNPost",
          manifestHash: "0x" + "2".repeat(64),
          shippedItemCount: 1,
          trackingCodes: {
            [physicalEntitlementId]: "VNP123456789VN",
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.batchNumber).toBe(1);

      // Verify entitlement status transitioned to FULFILLING
      const [ent] = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.id, physicalEntitlementId));
      expect(ent.status).toBe("FULFILLING");
      expect(ent.carrierTrackingCode).toBe("VNP123456789VN");
    });

    it("backer opens dispute for physical package damage", async () => {
      // Mark delivered first
      await db.update(schema.rewardEntitlements).set({ status: "DELIVERED" })
        .where(eq(schema.rewardEntitlements.id, physicalEntitlementId));

      const res = await post(`/v1/reward/backer/entitlements/${physicalEntitlementId}/dispute`)
        .set("Cookie", `ft_session=${backerSessionToken}`)
        .send({
          reason: "Package crushed in transit; hardcover spine damaged.",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("OPEN");
      disputeId = res.body.id;
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

      // Verify entitlement transitioned to REFUND_ELIGIBLE
      const [ent] = await db.select().from(schema.rewardEntitlements)
        .where(eq(schema.rewardEntitlements.id, physicalEntitlementId));
      expect(ent.status).toBe("REFUND_ELIGIBLE");
    });

    it("enforces state separation: premature completeCampaign on contract reverts", async () => {
      // In contract, campaign state is PRODUCTION_VERIFIED (enum index 2)
      // completeCampaign() strictly requires FULFILLMENT_COMPLETE (enum index 3)
      try {
        await publicClient.simulateContract({
          account: creatorWallet,
          abi: rewardArtifact.abi,
          address: rewardAddress,
          functionName: "completeCampaign",
          args: [onchainCampaignId],
        });
        expect(true).toBe(false); // Should have reverted!
      } catch (err: any) {
        expect(err.message).toMatch(/revert|WrongState/i);
      }
    });

    it("resolver attests fulfillment completion via HTTP and smart contract", async () => {
      const reportHash = "0x" + "3".repeat(64);

      // HTTP attest fulfillment complete
      const res = await post(`/v1/reward/resolver/campaigns/${campaignId}/fulfillment-complete`)
        .set("Cookie", `ft_session=${resolverSessionToken}`)
        .send({ fulfillmentReportHash: reportHash });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("FULFILLMENT_COMPLETE");

      // On-chain record fulfillment complete
      const fulfillReceipt = await send(resolverWallet, rewardArtifact.abi, rewardAddress, "recordFulfillmentComplete", [
        onchainCampaignId,
        reportHash as `0x${string}`,
      ]);
      await indexerService.processReceipt(fulfillReceipt.transactionHash);

      const onchainCamp = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "campaign",
        args: [onchainCampaignId],
      }) as any;
      expect(onchainCamp.state).toBe(3); // FULFILLMENT_COMPLETE

      // Finalize campaign completion
      await send(creatorWallet, rewardArtifact.abi, rewardAddress, "completeCampaign", [onchainCampaignId]);
      const finalizedCamp = await publicClient.readContract({
        address: rewardAddress,
        abi: rewardArtifact.abi,
        functionName: "campaign",
        args: [onchainCampaignId],
      }) as any;
      expect(finalizedCamp.state).toBe(4); // COMPLETED
    });
  });
});
