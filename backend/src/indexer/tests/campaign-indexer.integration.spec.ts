import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, defineChain, http, keccak256 } from "viem";
import type { PublicClient } from "viem";
import * as schema from "../../database/schema";
import { campaignAbi, campaignAbiHash, campaignPolicyHash, parseDeploymentManifest } from "../../blockchain/deployment";
import { CampaignIndexerService, CampaignConnection } from "../campaign-indexer.service";
import { campaignCommitment, CampaignSnapshot } from "../../modules/campaigns/policies/commitment";
import { campaignDraft } from "../../modules/campaigns/tests/fixtures/draft.fixture";

const root = resolve(__dirname, "../../../..");
const { migrateCampaignDatabase } = require("../../../scripts/campaigns/migrate-isolated.cjs");
const chain = defineChain({ id: 31339, name: "Campaign tests", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:9548"] } } });

describe("Campaign canonical ledger on isolated PostgreSQL and real local Anvil", () => {
  jest.setTimeout(60000);
  const client = createPublicClient({ chain, transport: http(), pollingInterval: 30 });
  let pool: Pool;
  let admin: Client;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let connection: CampaignConnection;
  let indexer: CampaignIndexerService;
  let accounts: `0x${string}`[];
  let address: `0x${string}`;
  let tokenAddress: `0x${string}`;
  let suiteSnapshot: string | undefined;
  let campaignId: string;
  let backerUser: string;
  let pledgeHash: `0x${string}`;
  let fork: string;
  const databaseName = `fundtogether_chain_test_${process.pid}`;
  const wallet = (actor: `0x${string}`) => createWalletClient({ account: actor, chain, transport: http() });
  const send = async (actor: `0x${string}`, functionName: string, args: unknown[], target = address, abi = campaignAbi) => {
    const hash = await wallet(actor).writeContract({ address: target, abi, functionName, args, gas: 2000000n });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    return hash;
  };
  const active = () => db.select().from(schema.campaignEntitlements).where(eq(schema.campaignEntitlements.canonical, true));

  beforeAll(async () => {
    const env = require("dotenv").parse(readFileSync(resolve(root, ".local/fundtogether/backend.env")));
    const url = new URL(env.DATABASE_URL); url.pathname = "/postgres";
    admin = new Client({ connectionString: url.toString() }); await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    await migrateCampaignDatabase(root, { databaseUrl: url.toString(), expectedDatabaseName: databaseName });
    pool = new Pool({ connectionString: url.toString() }); db = drizzle(pool, { schema });
    accounts = (await wallet(`0x${"0".repeat(40)}`).getAddresses()).map(value => value.toLowerCase() as `0x${string}`);
    expect(await client.request({ method: "web3_clientVersion" as any })).toMatch(/anvil/i);
    suiteSnapshot = await client.request({ method: "evm_snapshot" as any }) as string;
    const token = JSON.parse(readFileSync(resolve(root, "contracts/out/MockUSDC.sol/MockUSDC.json"), "utf8"));
    const campaignArtifact = JSON.parse(readFileSync(resolve(root, "contracts/out/FundTogetherCampaign.sol/FundTogetherCampaign.json"), "utf8"));
    const tokenReceipt = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: token.abi, bytecode: token.bytecode.object }) });
    expect(tokenReceipt.status).toBe("success"); tokenAddress = tokenReceipt.contractAddress!;
    const deployment = await client.waitForTransactionReceipt({ hash: await wallet(accounts[0]).deployContract({ abi: campaignArtifact.abi, bytecode: campaignArtifact.bytecode.object, args: [tokenAddress, accounts[1], accounts[2]] }) });
    expect(deployment.status).toBe("success"); address = deployment.contractAddress!;
    connection = { client: client as PublicClient, manifest: parseDeploymentManifest({ protocolKind: "CAMPAIGNS", chainId: 31339, rpcUrl: "http://127.0.0.1:9548", abiVersion: "campaigns-local-v6",
      abiHash: campaignAbiHash, policyHash: campaignPolicyHash, tokenDecimals: 6, confirmations: 1, contractAddress: address, tokenAddress,
      resolver: accounts[1], backupResolver: accounts[2], genesisHash: (await client.getBlock({ blockNumber: 0n })).hash,
      contractCodeHash: keccak256((await client.getCode({ address }))!), tokenCodeHash: keccak256((await client.getCode({ address: tokenAddress }))!),
      deploymentBlockNumber: deployment.blockNumber.toString(), deploymentBlockHash: deployment.blockHash,
    }) };
    indexer = new CampaignIndexerService(db, connection);
    const [owner, backer, reviewer] = await db.insert(schema.users).values([{ email: "creator@chain.test" }, { email: "backer@chain.test" }, { email: "resolver@chain.test" }]).returning();
    await db.insert(schema.platformRoles).values({ userId: reviewer.id, roles: ["RESOLVER"] });
    backerUser = backer.id;
    const [link] = await db.insert(schema.walletLinks).values([{ userId: owner.id, chainId: "31339", address: accounts[3] }, { userId: backer.id, chainId: "31339", address: accounts[4] }, { userId: reviewer.id, chainId: "31339", address: accounts[1] }]).returning();
    const [profile] = await db.insert(schema.creatorProfiles).values({ userId: owner.id, displayName: "Artist", bio: "Comic creator", ipDeclaration: "I own the publication rights", originalWorkPledge: true, studioWalletLinkId: link.id, status: "VERIFIED" }).returning();
    const now = (await client.getBlock()).timestamp;
    const deadline = now + 20n * 86400n;
    const config = campaignDraft(); config.goal = "20000000"; config.fundingDuration = 86400;
    const snapshot: CampaignSnapshot = { commitmentVersion: "campaigns-review-v1", config,
      creator: { userId: owner.id, profileId: profile.id, displayName: profile.displayName, ipDeclaration: profile.ipDeclaration },
      payoutWallet: { linkId: link.id, chainId: "31339", address: accounts[3] },
      preparation: { contentOutline: "A comic in twelve chapters.", budgetPlan: "Art, editing and design time.", evidencePlan: "Page proofs and complete PDF." },
      samples: [{ id: profile.id, mediaType: "image/png", sha256: `0x${"1".repeat(64)}`, sizeBytes: 100 }],
    };
    const commitment = campaignCommitment(snapshot);
    const [campaignRecord] = await db.insert(schema.campaigns).values({ creatorUserId: owner.id, title: config.title, pitch: config.pitch, story: config.story, category: config.category,
      goal: config.goal, fundingDuration: config.fundingDuration, draftConfig: config, frozenSnapshot: snapshot, commitmentHash: commitment, status: "APPROVED", frozenAt: new Date(), payoutWalletLinkId: link.id }).returning();
    campaignId = campaignRecord.id;
    await db.insert(schema.campaignReviews).values({ campaignId, resolverUserId: reviewer.id, outcome: "APPROVED", decisionReason: "Reviewed samples and frozen terms", commitmentHash: commitment, frozenSnapshot: snapshot });
    await send(accounts[1], "approveCampaign", [accounts[3], commitment, 20000000n, 10000000n, 86400n]);
    await send(accounts[3], "createCampaign", [commitment, 20000000n, 10000000n, 86400n]);
    await send(accounts[0], "mint", [accounts[4], 100000000n], tokenAddress, token.abi);
    await send(accounts[4], "approve", [address, 100000000n], tokenAddress, token.abi);
  });

  afterAll(async () => {
    try {
      await indexer?.onModuleDestroy(); await pool?.end();
      if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
    } finally {
      if (suiteSnapshot) expect(await client.request({ method: "evm_revert" as any, params: [suiteSnapshot] } as any)).toBe(true);
    }
  });

  it("rejects wrong-chain and wrong-contract receipts without granting entitlements", async () => {
    const wrongChain = new CampaignIndexerService(db, { ...connection, client: { ...client, getChainId: async () => 1 } as unknown as PublicClient });
    await expect(wrongChain.runOnce()).rejects.toThrow("identity mismatch");
    const token = JSON.parse(readFileSync(resolve(root, "contracts/out/MockUSDC.sol/MockUSDC.json"), "utf8"));
    const other = await send(accounts[0], "mint", [accounts[4], 1n], tokenAddress, token.abi);
    await expect(indexer.processReceipt(other)).rejects.toMatchObject({ status: 400 });
    expect(await active()).toHaveLength(0);
  });

  it("a reverted pledge cannot create an entitlement", async () => {
    const hash = await wallet(accounts[4]).writeContract({ address, abi: campaignAbi, functionName: "pledge", args: [999n, 1n], gas: 200000n });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe("reverted");
    await expect(indexer.processReceipt(hash)).rejects.toMatchObject({ status: 400 });
    expect(await active()).toHaveLength(0);
  });

  it("rebinds a published campaign when replaying the canonical CampaignCreated event", async () => {
    await db.update(schema.campaigns).set({ status: "PUBLISHED" }).where(eq(schema.campaigns.id, campaignId));
    await indexer.runOnce();
    const [binding] = await db.select().from(schema.campaignChainCampaigns).where(eq(schema.campaignChainCampaigns.campaignId, campaignId));
    expect(binding).toMatchObject({ campaignId, onchainCampaignId: "0", canonical: true });
  });

  it("binds exact reviewed metadata and creates one account-owned entitlement across duplicate syncs", async () => {
    fork = await client.request({ method: "evm_snapshot" as any }) as string;
    pledgeHash = await send(accounts[4], "pledge", [0n, 2n]);
    const secondPledgeHash = await send(accounts[4], "pledge", [0n, 1n]);
    await Promise.all([indexer.processReceipt(pledgeHash), indexer.processReceipt(pledgeHash), indexer.processReceipt(secondPledgeHash)]);
    await indexer.runOnce();
    const entitlements = await active();
    expect(entitlements).toHaveLength(2);
    expect(entitlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ campaignId, backerUserId: backerUser, chainId: "31339", contractAddress: address.toLowerCase(), transactionHash: pledgeHash, amountPaid: "20000000", quantity: "2", refunded: false }),
      expect.objectContaining({ campaignId, backerUserId: backerUser, chainId: "31339", contractAddress: address.toLowerCase(), transactionHash: secondPledgeHash, amountPaid: "10000000", quantity: "1", refunded: false }),
    ]));
    const [binding] = await db.select().from(schema.campaignChainCampaigns);
    expect(binding).toMatchObject({ campaignId, canonical: true, snapshot: { raised: "30000000", state: 0, productionApproved: false } });
  });

  it("rejects noncanonical logs and forged receipt status atomically", async () => {
    const logs = await client.getLogs({ address, fromBlock: BigInt(connection.manifest.deploymentBlockNumber) });
    const changed = logs.map(log => log.transactionHash === pledgeHash ? { ...log, blockHash: `0x${"f".repeat(64)}` } : log);
    const wrongLogs = new CampaignIndexerService(db, { ...connection, client: { ...client, getLogs: async () => changed } as unknown as PublicClient });
    await expect(wrongLogs.runOnce()).rejects.toThrow("Noncanonical Campaign log");
    const failedReceipt = new CampaignIndexerService(db, { ...connection, client: { ...client, getTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => {
      const receipt = await client.getTransactionReceipt({ hash }); return hash === pledgeHash ? { ...receipt, status: "reverted" } : receipt;
    } } as unknown as PublicClient });
    await expect(failedReceipt.runOnce()).rejects.toThrow("successful receipt");
    expect(await active()).toHaveLength(2);
  });

  it("does not transfer an already owned entitlement when a wallet links to another account", async () => {
    const [stranger] = await db.insert(schema.users).values({ email: "new-wallet-account@chain.test" }).returning();
    await db.update(schema.walletLinks).set({ userId: stranger.id }).where(eq(schema.walletLinks.address, accounts[4]));
    try {
      await indexer.runOnce();
      expect((await active())[0].backerUserId).toBe(backerUser);
    } finally { await db.update(schema.walletLinks).set({ userId: backerUser }).where(eq(schema.walletLinks.address, accounts[4])); }
  });

  it("cannot associate chain payments with edited or mismatched frozen terms", async () => {
    const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    const changed = structuredClone(campaign.frozenSnapshot!);
    changed.config.tiers[0].benefitItems[0].description = "A different promised PDF";
    await db.update(schema.campaigns).set({ frozenSnapshot: changed }).where(eq(schema.campaigns.id, campaignId));
    try { await indexer.runOnce(); expect(await active()).toHaveLength(0); }
    finally { await db.update(schema.campaigns).set({ frozenSnapshot: campaign.frozenSnapshot }).where(eq(schema.campaigns.id, campaignId)); }
    await indexer.runOnce();
    expect(await active()).toHaveLength(2);
  });

  it("orphaned payment loses rights, retains history, and a canonical replay restores only one entitlement", async () => {
    expect(await client.request({ method: "evm_revert" as any, params: [fork] } as any)).toBe(true);
    await client.request({ method: "evm_mine" as any });
    await indexer.runOnce();
    expect(await active()).toHaveLength(0);
    const history = await db.select().from(schema.campaignEntitlements);
    expect(history).toHaveLength(2); expect(history.every(item => item.canonical === false)).toBe(true);
    const orphan = await db.select().from(schema.chainEvents).where(and(eq(schema.chainEvents.transactionHash, pledgeHash), eq(schema.chainEvents.eventName, "Pledged")));
    expect(orphan[0].canonical).toBe(false);
    pledgeHash = await send(accounts[4], "pledge", [0n, 3n]);
    await indexer.processReceipt(pledgeHash);
    expect(await active()).toHaveLength(1);
  });

  it("matches and projects completion approval and canonical surplus claim events", async () => {
    await client.request({ method: "evm_increaseTime" as any, params: [86401] } as any);
    await send(accounts[1], "finalizeFunding", [0n]);
    await indexer.runOnce();
    let [binding] = await db.select().from(schema.campaignChainCampaigns);
    expect(binding.snapshot.state).toBe(1);

    await send(accounts[3], "submitProduction", [0n, `0x${"2".repeat(64)}`]);
    await send(accounts[1], "reviewProduction", [0n, `0x${"2".repeat(64)}`, true]);
    const productionBlock = await client.getBlock();
    await send(accounts[3], "confirmCampaignCompletion", [0n, productionBlock.timestamp + 86400n]);
    await send(accounts[3], "submitRelease", [0n, `0x${"3".repeat(64)}`, `0x${"4".repeat(64)}`]);
    await send(accounts[1], "reviewRelease", [0n, `0x${"3".repeat(64)}`, `0x${"4".repeat(64)}`, true]);
    await client.request({ method: "evm_increaseTime" as any, params: [7 * 86400 + 1] } as any);
    await client.request({ method: "evm_mine" as any });
    await indexer.runOnce();

    const [campaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    const [resolverUser] = await db.select().from(schema.users).where(eq(schema.users.email, "resolver@chain.test"));
    const streamId = indexer.streamId();
    const requestHash = `0x${"5".repeat(64)}`;
    const decisionHash = `0x${"6".repeat(64)}`;
    const [request] = await db.insert(schema.campaignCompletionRequests).values({
      campaignId, streamId, creatorUserId: campaign.creatorUserId, commitmentHash: campaign.commitmentHash!, revision: 1,
      requestHash, title: "Completion dossier", summary: "Final PDF is ready for release.", reason: "Production and delivery obligations are complete.", status: "DRAFT",
    }).returning();
    const requestTx = await send(accounts[3], "requestCompletion", [0n, requestHash]);
    await expect(indexer.processExpectedReceipt({ txHash: requestTx, campaignId, action: "requestCompletion", userId: campaign.creatorUserId })).resolves.toMatchObject({ state: "ON_CHAIN_CONFIRMED" });

    const [decision] = await db.insert(schema.campaignCompletionDecisions).values({
      requestId: request.id, resolverUserId: resolverUser.id, outcome: "APPROVE", reason: "The final evidence is complete and consistent.", decisionHash,
    }).returning();
    expect(decision.requestId).toBe(request.id);
    const approveTx = await send(accounts[1], "approveCompletion", [0n, requestHash, decisionHash]);
    await expect(indexer.processExpectedReceipt({ txHash: approveTx, campaignId, action: "approveCompletion", userId: resolverUser.id })).resolves.toMatchObject({ state: "ON_CHAIN_CONFIRMED" });
    await indexer.runOnce();
    [binding] = await db.select().from(schema.campaignChainCampaigns);
    expect(binding.snapshot).toMatchObject({ state: 6, completionRaised: "30000000", surplusPool: "10000000", surplusClaimed: "0" });

    const claimTx = await send(accounts[4], "claimSurplus", [0n, 0]);
    await expect(indexer.processExpectedReceipt({ txHash: claimTx, campaignId, action: "claimSurplus", userId: backerUser })).resolves.toMatchObject({ state: "ON_CHAIN_CONFIRMED" });
    const claims = await db.select().from(schema.campaignSurplusClaims).where(eq(schema.campaignSurplusClaims.campaignId, campaignId));
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ backerWallet: accounts[4], choice: "REFUND_TO_BACKER", recipient: accounts[4], amount: "10000000", canonical: true });
    await indexer.runOnce();
    expect(await db.select().from(schema.campaignSurplusClaims).where(eq(schema.campaignSurplusClaims.campaignId, campaignId))).toHaveLength(1);
  });
});
