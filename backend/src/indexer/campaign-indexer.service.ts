import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeFunctionData, parseEventLogs } from "viem";
import type { Log, PublicClient, TransactionReceipt } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { chainEvents, campaignChainCampaigns, campaignEntitlements, campaignCompletionDecisions, campaignCompletionRequests, campaignSurplusClaims, campaignPayoutDecisions, campaignPayoutRequests, indexerStreams, platformRoles, campaigns, walletLinks } from "../database/schema";
import type { CampaignChainSnapshot } from "../database/schema";
import { campaignAbi, campaignClient, DeploymentManifest, parseDeploymentManifest, verifyDeploymentManifest } from "../blockchain/deployment";
import { campaignCommitment } from "../modules/campaigns/policies/commitment";
import { createCampaignDraftSchema } from "../modules/campaigns/schemas/campaign.schema";
import { derivePublicationJudgeCase } from "../modules/campaigns/policies/publication-judge-case";

export const CAMPAIGN_CONNECTION = Symbol("CAMPAIGN_CONNECTION");
export interface CampaignConnection { manifest: DeploymentManifest; client: PublicClient }
export function loadCampaignConnection(): CampaignConnection | null {
  const file = process.env.CAMPAIGNS_MANIFEST_PATH || resolve(process.cwd(), "../.local/fundtogether/generated/campaigns-deployment.local.json");
  if (!existsSync(file)) return null;
  const manifest = parseDeploymentManifest(JSON.parse(readFileSync(file, "utf8")));
  return { manifest, client: campaignClient(manifest) as PublicClient };
}
const jsonSafe = <T>(value: unknown): T => JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
function pledgeAmountMatches(args: Record<string, unknown>, price: string) {
  try {
    const quantity = BigInt(String(args.quantity));
    const amount = BigInt(String(args.amount));
    return quantity > 0n && amount === BigInt(price) * quantity;
  } catch {
    return false;
  }
}

export type CampaignTransactionAction =
  | "createPublicationCase" | "votePublicationCase" | "expirePublicationCase" | "createCampaign" | "pledge" | "submitProduction" | "submitRelease"
  | "reviewProduction" | "confirmCampaignCompletion" | "reviewRelease" | "challengeRelease" | "resolveChallenge"
  | "finalizeFunding" | "startRefunds" | "claimRefund" | "requestCompletion" | "approveCompletion" | "rejectCompletion" | "claimSurplus" | "cancelCampaign"
  | "requestDisbursement" | "approveDisbursement" | "rejectDisbursement";

const expectedEvent: Record<CampaignTransactionAction, string> = {
  createPublicationCase: "JudgeCaseCreated",
  votePublicationCase: "JudgeVoted",
  expirePublicationCase: "JudgeCaseResolved",
  createCampaign: "CampaignCreated",
  pledge: "Pledged",
  submitProduction: "ProductionSubmitted",
  submitRelease: "ReleaseSubmitted",
  reviewProduction: "ProductionReviewed",
  confirmCampaignCompletion: "CampaignCompletionConfirmed",
  reviewRelease: "ReleaseReviewed",
  challengeRelease: "ReleaseChallenged",
  resolveChallenge: "ChallengeResolved",
  finalizeFunding: "FundingFinalized",
  startRefunds: "RefundsOpened",
  claimRefund: "Refunded",
  requestCompletion: "CompletionRequested",
  approveCompletion: "CompletionApproved",
  rejectCompletion: "CompletionRejected",
  requestDisbursement: "DisbursementRequested",
  approveDisbursement: "DisbursementApproved",
  rejectDisbursement: "DisbursementRejected",
  claimSurplus: "SurplusClaimed",
  cancelCampaign: "RefundsOpened",
};

// CampaignCreated is replayed when the indexer rebuilds the canonical projection.
// A campaign may already have moved past APPROVED by then, so replay eligibility
// must follow the lifecycle states that can have an on-chain campaign.
const ONCHAIN_CAMPAIGN_STATUSES = [
  "APPROVED",
  "PUBLISHED",
  "ACTIVE",
  "PRODUCTION_VERIFIED",
  "FULFILLMENT_COMPLETE",
  "COMPLETED",
  "STOPPED",
] as const;

@Injectable()
export class CampaignIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignIndexerService.name);
  private running: Promise<{ blockNumber: string; events: number; entitlements: number }> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(CAMPAIGN_CONNECTION) private readonly connection: CampaignConnection | null) {}

  onModuleInit() {
    if (!this.connection || process.env.CAMPAIGNS_INDEXER_POLL_ENABLED === "false" || process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => { void this.runOnce().catch(() => this.logger.debug("Campaign sync unavailable")); }, 4000);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running?.catch(() => undefined); }

  private connected() {
    if (!this.connection) throw new ServiceUnavailableException("Campaign deployment is not configured");
    return this.connection;
  }
  streamId() {
    const { manifest: m } = this.connected();
    return `campaigns:${m.chainId}:${m.contractAddress}:${m.genesisHash}`;
  }
  async deployment() {
    const { client, manifest } = this.connected();
    await verifyDeploymentManifest(client, manifest);
    return manifest;
  }
  async chainTime() { return (await this.connected().client.getBlock({ blockTag: "latest" })).timestamp; }
  async isTermsApproved(creator: string, commitment: string, goal: bigint, price: bigint, duration: bigint) {
    const { client, manifest } = this.connected();
    await verifyDeploymentManifest(client, manifest);
    const termsHash = await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "termsHash",
      args: [creator as `0x${string}`, commitment as `0x${string}`, goal, price, duration] }) as `0x${string}`;
    const caseCount = await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "publicationCaseCount" }) as bigint;
    if (caseCount === 0n) return { termsHash, approved: false };
    const caseId = await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "publicationCaseId", args: [termsHash] }) as bigint;
    if (caseId >= caseCount) return { termsHash, approved: false };
    const publication = await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "publicationCase", args: [caseId] }) as readonly unknown[];
    return { termsHash, approved: Number(publication[12]) === 1 && publication[0]?.toString().toLowerCase() === creator.toLowerCase() && publication[1]?.toString().toLowerCase() === commitment.toLowerCase() };
  }
  async processReceipt(txHash: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new BadRequestException("Invalid transaction hash");
    const { client, manifest } = this.connected();
    await verifyDeploymentManifest(client, manifest);
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success" || !receipt.logs.some(log => log.address.toLowerCase() === manifest.contractAddress))
      throw new BadRequestException("Receipt is not a successful Campaign transaction");
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash) throw new BadRequestException("Receipt is not canonical");
    let result = await this.runOnce();
    // A background scan may have started before this transaction was mined.
    if (BigInt(result.blockNumber) < receipt.blockNumber) result = await this.runOnce();
    if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
      throw new BadRequestException("Receipt was reorganized during synchronization");
    return { ...result, txHash, state: "ON_CHAIN_CONFIRMED" };
  }

  async processExpectedReceipt(input: { txHash: string; campaignId: string; action: CampaignTransactionAction; userId: string }) {
    const { client, manifest } = this.connected();
    await verifyDeploymentManifest(client, manifest);
    const hash = input.txHash as `0x${string}`;
    let receipt: TransactionReceipt | null;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch (error) {
      if ((error as { name?: string }).name?.includes("TransactionReceiptNotFound")) {
        return { txHash: input.txHash, state: "PENDING" as const };
      }
      throw error;
    }
    if (receipt.status !== "success") return { txHash: input.txHash, state: "REVERTED" as const };
    const transaction = await client.getTransaction({ hash });
    if (transaction.to?.toLowerCase() !== manifest.contractAddress) return { txHash: input.txHash, state: "UNRELATED" as const };

    let decoded: { functionName: string; args?: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: campaignAbi, data: transaction.input });
    } catch {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }
    if (decoded.functionName !== input.action) return { txHash: input.txHash, state: "UNRELATED" as const };

    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, input.campaignId));
    if (!campaign?.frozenSnapshot || campaign.category !== "COMICS_ARTBOOK" || !campaign.commitmentHash) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }
    const [actor] = await this.db.select().from(walletLinks).where(and(
      eq(walletLinks.userId, input.userId), eq(walletLinks.chainId, String(manifest.chainId)), eq(walletLinks.address, transaction.from.toLowerCase()),
    ));
    if (!actor) return { txHash: input.txHash, state: "UNRELATED" as const };
    const resolverAction = input.action === "approveCompletion" || input.action === "rejectCompletion"
      || input.action === "approveDisbursement" || input.action === "rejectDisbursement";
    if (resolverAction) {
      const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, input.userId));
      const resolverWallet = transaction.from.toLowerCase() === manifest.resolver.toLowerCase() || transaction.from.toLowerCase() === manifest.backupResolver.toLowerCase();
      if (!role?.roles.includes("RESOLVER") || !resolverWallet) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
    }

    const args = [...(decoded.args ?? [])] as unknown[];
    const expectedTerms = [
      campaign.commitmentHash.toLowerCase(),
      campaign.frozenSnapshot.config.goal,
      campaign.frozenSnapshot.config.tiers[0].price,
      String(campaign.frozenSnapshot.config.fundingDuration),
    ];
    const publicationAction = input.action === "createPublicationCase" || input.action === "votePublicationCase" || input.action === "expirePublicationCase";
    const streamId = this.streamId();
    const [binding] = await this.db.select().from(campaignChainCampaigns).where(and(
      eq(campaignChainCampaigns.streamId, streamId), eq(campaignChainCampaigns.campaignId, input.campaignId), eq(campaignChainCampaigns.canonical, true),
    ));
    if (input.action === "createPublicationCase") {
      if (transaction.from.toLowerCase() !== campaign.frozenSnapshot.payoutWallet.address.toLowerCase() ||
        expectedTerms.some((value, index) => String(args[index]).toLowerCase() !== value)) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
    } else if (input.action === "votePublicationCase" || input.action === "expirePublicationCase") {
      if (args.length < 1) return { txHash: input.txHash, state: "UNRELATED" as const };
    } else if (input.action === "createCampaign") {
      if (transaction.from.toLowerCase() !== campaign.frozenSnapshot.payoutWallet.address ||
        expectedTerms.some((value, index) => String(args[index]).toLowerCase() !== value)) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
    } else if (!binding || String(args[0]) !== binding.onchainCampaignId) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    const contractLogs = receipt.logs.filter(log => log.address.toLowerCase() === manifest.contractAddress);
    const events = parseEventLogs({ abi: campaignAbi, logs: contractLogs, strict: true });
    const matchingEvent = events.find(event => {
      if (event.eventName !== expectedEvent[input.action]) return false;
      const eventArgs = event.args as Record<string, unknown>;
      if (input.action === "createPublicationCase") {
        return String(eventArgs.creator).toLowerCase() === campaign.frozenSnapshot!.payoutWallet.address &&
          String(eventArgs.commitmentHash).toLowerCase() === campaign.commitmentHash!.toLowerCase();
      }
      if (input.action === "votePublicationCase") {
        return String(eventArgs.judge).toLowerCase() === transaction.from.toLowerCase() && String(eventArgs.caseId) === String(args[0]);
      }
      if (input.action === "expirePublicationCase") {
        return String(eventArgs.caseId) === String(args[0]) && Number(eventArgs.status) === 3;
      }
      if (input.action === "createCampaign") {
        return String(eventArgs.creator).toLowerCase() === campaign.frozenSnapshot!.payoutWallet.address &&
          String(eventArgs.commitmentHash).toLowerCase() === campaign.commitmentHash!.toLowerCase();
      }
      if (input.action === "pledge") {
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.backer).toLowerCase() === transaction.from.toLowerCase() &&
          pledgeAmountMatches(eventArgs, campaign.frozenSnapshot!.config.tiers[0].price);
      }
      if (input.action === "requestCompletion") {
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.creator).toLowerCase() === campaign.frozenSnapshot!.payoutWallet.address.toLowerCase() &&
          String(eventArgs.requestHash).toLowerCase() === String(args[1]).toLowerCase();
      }
      if (input.action === "approveCompletion" || input.action === "rejectCompletion") {
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.requestHash).toLowerCase() === String(args[1]).toLowerCase() &&
          String(eventArgs.decisionHash).toLowerCase() === String(args[2]).toLowerCase() &&
          String(eventArgs.reviewer).toLowerCase() === transaction.from.toLowerCase();
      }
      if (input.action === "requestDisbursement") {
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.creator).toLowerCase() === campaign.frozenSnapshot!.payoutWallet.address.toLowerCase() &&
          String(eventArgs.requestHash).toLowerCase() === String(args[1]).toLowerCase() &&
          String(eventArgs.amount) === String(args[2]);
      }
      if (input.action === "approveDisbursement" || input.action === "rejectDisbursement") {
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.requestHash).toLowerCase() === String(args[1]).toLowerCase() &&
          String(eventArgs.decisionHash).toLowerCase() === String(args[2]).toLowerCase() &&
          String(eventArgs.reviewer).toLowerCase() === transaction.from.toLowerCase();
      }
      if (input.action === "claimSurplus") {
        const choice = Number(args[1]);
        const expectedRecipient = choice === 0 ? transaction.from.toLowerCase() : campaign.frozenSnapshot!.payoutWallet.address.toLowerCase();
        return String(eventArgs.campaignId) === binding!.onchainCampaignId &&
          String(eventArgs.backer).toLowerCase() === transaction.from.toLowerCase() &&
          String(eventArgs.choice) === String(args[1]) &&
          String(eventArgs.recipient).toLowerCase() === expectedRecipient &&
          BigInt(String(eventArgs.amount)) > 0n;
      }
      return String(eventArgs.campaignId) === binding!.onchainCampaignId;
    });
    if (!matchingEvent) return { txHash: input.txHash, state: "UNRELATED" as const };

    if (input.action === "requestCompletion") {
      const [request] = await this.db.select().from(campaignCompletionRequests).where(and(
        eq(campaignCompletionRequests.campaignId, input.campaignId),
        eq(campaignCompletionRequests.streamId, streamId),
        eq(campaignCompletionRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      if (!request || request.commitmentHash.toLowerCase() !== campaign.commitmentHash.toLowerCase()) return { txHash: input.txHash, state: "UNRELATED" as const };
    } else if (input.action === "approveCompletion" || input.action === "rejectCompletion") {
      if (!binding || String(args[1]).toLowerCase() !== String(binding.snapshot.completionRequestHash).toLowerCase()) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
      const [request] = await this.db.select().from(campaignCompletionRequests).where(and(
        eq(campaignCompletionRequests.campaignId, input.campaignId), eq(campaignCompletionRequests.streamId, streamId),
        eq(campaignCompletionRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      const [decision] = request ? await this.db.select().from(campaignCompletionDecisions).where(and(
        eq(campaignCompletionDecisions.requestId, request.id), eq(campaignCompletionDecisions.decisionHash, String(args[2]).toLowerCase()),
      )) : [];
      const outcomeMatches = input.action === "approveCompletion" ? decision?.outcome === "APPROVE" : decision?.outcome === "REJECT" || decision?.outcome === "CHANGES_REQUESTED";
      if (!request || !decision || !outcomeMatches) return { txHash: input.txHash, state: "UNRELATED" as const };
    } else if (input.action === "requestDisbursement") {
      const [request] = await this.db.select().from(campaignPayoutRequests).where(and(
        eq(campaignPayoutRequests.campaignId, input.campaignId), eq(campaignPayoutRequests.streamId, streamId),
        eq(campaignPayoutRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      if (!request || request.commitmentHash.toLowerCase() !== campaign.commitmentHash.toLowerCase() || request.amount !== String(args[2])) return { txHash: input.txHash, state: "UNRELATED" as const };
    } else if (input.action === "approveDisbursement" || input.action === "rejectDisbursement") {
      const [request] = await this.db.select().from(campaignPayoutRequests).where(and(
        eq(campaignPayoutRequests.campaignId, input.campaignId), eq(campaignPayoutRequests.streamId, streamId),
        eq(campaignPayoutRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      const [decision] = request ? await this.db.select().from(campaignPayoutDecisions).where(and(
        eq(campaignPayoutDecisions.requestId, request.id), eq(campaignPayoutDecisions.decisionHash, String(args[2]).toLowerCase()),
      )) : [];
      const outcomeMatches = input.action === "approveDisbursement" ? decision?.outcome === "APPROVE" : decision?.outcome === "REJECT" || decision?.outcome === "CHANGES_REQUESTED";
      if (!request || !decision || !outcomeMatches) return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    await this.processReceipt(input.txHash);
    if (publicationAction) {
      const [publicationEvent] = await this.db.select({ transactionHash: chainEvents.transactionHash }).from(chainEvents).where(and(
        eq(chainEvents.streamId, streamId), eq(chainEvents.transactionHash, input.txHash),
        eq(chainEvents.eventName, expectedEvent[input.action]), eq(chainEvents.canonical, true),
      ));
      return { txHash: input.txHash, state: publicationEvent ? "ON_CHAIN_CONFIRMED" as const : "INDEXING" as const };
    }
    const [canonicalBinding] = await this.db.select().from(campaignChainCampaigns).where(and(
      eq(campaignChainCampaigns.streamId, streamId), eq(campaignChainCampaigns.campaignId, input.campaignId), eq(campaignChainCampaigns.canonical, true),
    ));
    if (!canonicalBinding) return { txHash: input.txHash, state: "INDEXING" as const };
    if (input.action === "createCampaign" && String((matchingEvent.args as Record<string, unknown>).campaignId) !== canonicalBinding.onchainCampaignId) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }
    if (input.action === "pledge") {
      const [entitlement] = await this.db.select({ id: campaignEntitlements.id }).from(campaignEntitlements).where(and(
        eq(campaignEntitlements.campaignId, input.campaignId), eq(campaignEntitlements.transactionHash, input.txHash),
        eq(campaignEntitlements.backerUserId, input.userId), eq(campaignEntitlements.canonical, true),
      ));
      if (!entitlement) return { txHash: input.txHash, state: "INDEXING" as const };
    }
    if (input.action === "requestCompletion") {
      const [request] = await this.db.select({ status: campaignCompletionRequests.status }).from(campaignCompletionRequests).where(and(
        eq(campaignCompletionRequests.campaignId, input.campaignId), eq(campaignCompletionRequests.streamId, streamId),
        eq(campaignCompletionRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      if (request?.status !== "SUBMITTED_ON_CHAIN" && request?.status !== "UNDER_REVIEW") return { txHash: input.txHash, state: "INDEXING" as const };
    }
    if (input.action === "requestDisbursement") {
      const [request] = await this.db.select({ status: campaignPayoutRequests.status }).from(campaignPayoutRequests).where(and(
        eq(campaignPayoutRequests.campaignId, input.campaignId), eq(campaignPayoutRequests.streamId, streamId),
        eq(campaignPayoutRequests.requestHash, String(args[1]).toLowerCase()),
      ));
      if (request?.status !== "SUBMITTED_ON_CHAIN" && request?.status !== "UNDER_REVIEW") return { txHash: input.txHash, state: "INDEXING" as const };
    }
    if (input.action === "approveCompletion" || input.action === "rejectCompletion") {
      const [decision] = await this.db.select({ transactionHash: chainEvents.transactionHash }).from(chainEvents).where(and(
        eq(chainEvents.streamId, streamId), eq(chainEvents.transactionHash, input.txHash), eq(chainEvents.eventName, expectedEvent[input.action]), eq(chainEvents.canonical, true),
      ));
      if (!decision) return { txHash: input.txHash, state: "INDEXING" as const };
    }
    if (input.action === "approveDisbursement" || input.action === "rejectDisbursement") {
      const [decision] = await this.db.select({ transactionHash: chainEvents.transactionHash }).from(chainEvents).where(and(
        eq(chainEvents.streamId, streamId), eq(chainEvents.transactionHash, input.txHash), eq(chainEvents.eventName, expectedEvent[input.action]), eq(chainEvents.canonical, true),
      ));
      if (!decision) return { txHash: input.txHash, state: "INDEXING" as const };
    }
    if (input.action === "claimSurplus") {
      const [claim] = await this.db.select().from(campaignSurplusClaims).where(and(
        eq(campaignSurplusClaims.campaignId, input.campaignId), eq(campaignSurplusClaims.streamId, streamId),
        eq(campaignSurplusClaims.transactionHash, input.txHash), eq(campaignSurplusClaims.backerWallet, transaction.from.toLowerCase()), eq(campaignSurplusClaims.canonical, true),
      ));
      const eventArgs = matchingEvent.args as Record<string, unknown>;
      const expectedRecipient = Number(args[1]) === 0 ? transaction.from.toLowerCase() : campaign.frozenSnapshot.payoutWallet.address.toLowerCase();
      if (!claim || claim.choice !== (Number(args[1]) === 0 ? "REFUND_TO_BACKER" : "DONATE_TO_CREATOR") || claim.recipient !== expectedRecipient || claim.amount !== String(eventArgs.amount)) {
        return { txHash: input.txHash, state: "INDEXING" as const };
      }
    }
    return { txHash: input.txHash, state: "ON_CHAIN_CONFIRMED" as const };
  }

  runOnce() {
    if (!this.running) this.running = this.sync().finally(() => { this.running = null; });
    return this.running;
  }

  private async sync() {
    const { client, manifest } = this.connected();
    await verifyDeploymentManifest(client, manifest);
    const streamId = this.streamId();
    return this.db.transaction(async tx => {
      // Serialize independent API/worker instances for this exact deployment.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${streamId}))`);
      const head = await client.getBlock({ blockTag: "latest" });
      if (head.number < BigInt(manifest.deploymentBlockNumber)) throw new Error("Campaign deployment is outside canonical chain");
      const logs: Log[] = [];
      const seen = new Set<string>();
      // Bounded RPC ranges; replay is deliberate for the small local pilot and reorg recovery.
      for (let from = BigInt(manifest.deploymentBlockNumber); from <= head.number; from += 2000n) {
        const to = from + 1999n < head.number ? from + 1999n : head.number;
        for (const log of await client.getLogs({ address: manifest.contractAddress, fromBlock: from, toBlock: to })) {
          const key = `${log.transactionHash}:${log.logIndex}:${log.blockHash}`;
          if (!seen.has(key)) { logs.push(log); seen.add(key); }
        }
      }
      logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
      const receipts = new Map<string, TransactionReceipt>();
      const blocks = new Map<string, { hash: string; timestamp: bigint }>();
      for (const log of logs) {
        if (log.removed || log.address.toLowerCase() !== manifest.contractAddress || log.blockHash == null || log.blockNumber == null || log.transactionHash == null || log.logIndex == null)
          throw new Error("Invalid Campaign log identity");
        if (!blocks.has(log.blockNumber.toString())) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          blocks.set(log.blockNumber.toString(), { hash: block.hash, timestamp: block.timestamp });
        }
        if (blocks.get(log.blockNumber.toString())!.hash !== log.blockHash) throw new Error("Noncanonical Campaign log");
        if (!receipts.has(log.transactionHash)) receipts.set(log.transactionHash, await client.getTransactionReceipt({ hash: log.transactionHash }));
        const receipt = receipts.get(log.transactionHash)!;
        if (receipt.status !== "success" || receipt.blockHash !== log.blockHash || receipt.blockNumber !== log.blockNumber ||
          !receipt.logs.some(item => item.logIndex === log.logIndex && item.address.toLowerCase() === manifest.contractAddress && item.data === log.data && item.topics.join() === log.topics.join()))
          throw new Error("Campaign log does not match a successful receipt");
      }
      const decoded = parseEventLogs({ abi: campaignAbi, logs, strict: true });
      const judgeEvents = decoded.map(log => ({
        eventName: log.eventName,
        args: log.args as Record<string, unknown>,
        canonical: true,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
      }));
      // No destructive reset: orphaned event/entitlement history is retained but cannot grant access.
      await tx.insert(indexerStreams).values({ streamId, status: "syncing" }).onConflictDoNothing();
      await tx.update(chainEvents).set({ canonical: false }).where(eq(chainEvents.streamId, streamId));
      await tx.update(campaignChainCampaigns).set({ canonical: false }).where(eq(campaignChainCampaigns.streamId, streamId));
      await tx.update(campaignEntitlements).set({ canonical: false }).where(eq(campaignEntitlements.streamId, streamId));
      await tx.update(campaignSurplusClaims).set({ canonical: false }).where(eq(campaignSurplusClaims.streamId, streamId));
      const bindings = new Map<string, { campaignId: string; snapshot: CampaignChainSnapshot }>();
      const refunded = new Set<string>();
      const publicationCommitments = new Set(judgeEvents.filter(event => event.eventName === "JudgeCaseCreated")
        .map(event => String(event.args.commitmentHash).toLowerCase()));
      for (const commitmentHash of publicationCommitments) {
        const publication = derivePublicationJudgeCase(judgeEvents, commitmentHash);
        if (!publication) continue;
        const candidates = await tx.select().from(campaigns).where(eq(campaigns.commitmentHash, commitmentHash));
        const candidate = candidates.find(item => item.category === "COMICS_ARTBOOK" && item.frozenSnapshot &&
          String(item.frozenSnapshot.payoutWallet.address).toLowerCase() === publication.creator &&
          campaignCommitment(item.frozenSnapshot) === commitmentHash);
        if (!candidate) continue;
        if (publication.status === "APPROVED") {
          await tx.update(campaigns).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(campaigns.id, candidate.id));
        } else if (publication.status === "REJECTED" || publication.status === "EXPIRED") {
          await tx.update(campaigns).set({ status: "DRAFT", frozenAt: null, frozenSnapshot: null, commitmentHash: null,
            payoutWalletLinkId: null, reviewStartedAt: null, onchainCampaignId: null, updatedAt: new Date() }).where(eq(campaigns.id, candidate.id));
        }
      }
      for (const log of decoded) {
        const args = log.args as Record<string, any>;
        await tx.insert(chainEvents).values({ streamId, transactionHash: log.transactionHash!, logIndex: log.logIndex!, blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(),
          eventName: log.eventName, args: jsonSafe(args), canonical: true })
          .onConflictDoUpdate({ target: [chainEvents.streamId, chainEvents.transactionHash, chainEvents.logIndex, chainEvents.blockHash], set: { canonical: true } });
        if (log.eventName === "Refunded") refunded.add(`${args.campaignId}:${String(args.backer).toLowerCase()}`);
        if (log.eventName !== "CampaignCreated") continue;
        const publication = derivePublicationJudgeCase(judgeEvents, String(args.commitmentHash));
        if (!publication || publication.status !== "APPROVED" || publication.creator !== String(args.creator).toLowerCase()) continue;
        const candidates = await tx.select().from(campaigns).where(and(
          eq(campaigns.commitmentHash, args.commitmentHash),
          inArray(campaigns.status, ONCHAIN_CAMPAIGN_STATUSES),
        ));
        const candidate = candidates.find(item => {
          const frozen = item.frozenSnapshot;
          return item.category === "COMICS_ARTBOOK" && frozen && createCampaignDraftSchema.safeParse(frozen.config).success &&
            campaignCommitment(frozen) === args.commitmentHash && frozen.payoutWallet.address === String(args.creator).toLowerCase() &&
            frozen.payoutWallet.chainId === String(manifest.chainId) && frozen.config.goal === String(args.goal) && frozen.config.tiers[0].price === String(args.price) &&
            BigInt(frozen.config.fundingDuration) + blocks.get(log.blockNumber!.toString())!.timestamp === args.fundingDeadline;
        });
        if (!candidate) continue;
        const snapshot = jsonSafe<CampaignChainSnapshot>(await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "campaign", args: [args.campaignId], blockNumber: head.number }));
        const key = String(args.campaignId);
        bindings.set(key, { campaignId: candidate.id, snapshot });
        await tx.insert(campaignChainCampaigns).values({ streamId, onchainCampaignId: key, campaignId: candidate.id, snapshot, canonical: true })
          .onConflictDoUpdate({ target: [campaignChainCampaigns.streamId, campaignChainCampaigns.onchainCampaignId], set: { campaignId: candidate.id, snapshot, canonical: true } });
      }
      let entitlements = 0;
      for (const log of decoded) {
        if (log.eventName !== "Pledged") continue;
        const args = log.args as Record<string, any>;
        const binding = bindings.get(String(args.campaignId));
        if (!binding || !pledgeAmountMatches(args, binding.snapshot.price)) continue;
        const wallet = String(args.backer).toLowerCase();
        const [link] = await tx.select().from(walletLinks).where(and(eq(walletLinks.chainId, String(manifest.chainId)), eq(walletLinks.address, wallet)));
        const value = { campaignId: binding.campaignId, streamId, chainId: String(manifest.chainId), contractAddress: manifest.contractAddress,
          transactionHash: log.transactionHash!, logIndex: log.logIndex!, blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(),
          backerWallet: wallet, backerUserId: link?.userId ?? null, amountPaid: String(args.amount), quantity: String(args.quantity), canonical: true, refunded: refunded.has(`${args.campaignId}:${wallet}`) };
        await tx.insert(campaignEntitlements).values(value).onConflictDoUpdate({
          target: [campaignEntitlements.chainId, campaignEntitlements.contractAddress, campaignEntitlements.transactionHash, campaignEntitlements.logIndex],
          set: { ...value, backerUserId: sql`COALESCE(${campaignEntitlements.backerUserId}, ${value.backerUserId})` },
        });
        entitlements++;
      }
      for (const log of decoded) {
        const args = log.args as Record<string, any>;
        if (log.eventName === "CompletionRequested") {
          const requestHash = String(args.requestHash).toLowerCase();
          const [request] = await tx.select().from(campaignCompletionRequests).where(and(
            eq(campaignCompletionRequests.campaignId, bindings.get(String(args.campaignId))?.campaignId ?? ""),
            eq(campaignCompletionRequests.streamId, streamId),
            eq(campaignCompletionRequests.requestHash, requestHash),
          ));
          if (request && String(args.creator).toLowerCase() === String(bindings.get(String(args.campaignId))?.snapshot.creator).toLowerCase()) {
            await tx.update(campaignCompletionRequests).set({ status: "SUBMITTED_ON_CHAIN", requestTxHash: log.transactionHash!, requestedAt: new Date(Number(blocks.get(log.blockNumber!.toString())!.timestamp) * 1000), updatedAt: new Date() }).where(eq(campaignCompletionRequests.id, request.id));
          }
        }
        if (log.eventName === "CompletionApproved" || log.eventName === "CompletionRejected") {
          const requestHash = String(args.requestHash).toLowerCase();
          const [request] = await tx.select().from(campaignCompletionRequests).where(and(
            eq(campaignCompletionRequests.campaignId, bindings.get(String(args.campaignId))?.campaignId ?? ""),
            eq(campaignCompletionRequests.streamId, streamId),
            eq(campaignCompletionRequests.requestHash, requestHash),
          ));
          if (request) {
            const [decision] = await tx.select().from(campaignCompletionDecisions).where(and(
              eq(campaignCompletionDecisions.requestId, request.id), eq(campaignCompletionDecisions.decisionHash, String(args.decisionHash).toLowerCase()),
            ));
            const status = log.eventName === "CompletionApproved" ? "APPROVED" : decision?.outcome === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REJECTED";
            await tx.update(campaignCompletionRequests).set({ status, decisionHash: String(args.decisionHash).toLowerCase(), decisionTxHash: log.transactionHash!, updatedAt: new Date() }).where(eq(campaignCompletionRequests.id, request.id));
            if (decision) await tx.update(campaignCompletionDecisions).set({ txHash: log.transactionHash! }).where(eq(campaignCompletionDecisions.id, decision.id));
          }
        }
        if (log.eventName === "DisbursementRequested") {
          const requestHash = String(args.requestHash).toLowerCase();
          const binding = bindings.get(String(args.campaignId));
          const [request] = await tx.select().from(campaignPayoutRequests).where(and(
            eq(campaignPayoutRequests.campaignId, binding?.campaignId ?? ""),
            eq(campaignPayoutRequests.streamId, streamId),
            eq(campaignPayoutRequests.requestHash, requestHash),
          ));
          if (request && String(args.creator).toLowerCase() === String(binding?.snapshot.creator).toLowerCase() && request.amount === String(args.amount)) {
            await tx.update(campaignPayoutRequests).set({ status: "SUBMITTED_ON_CHAIN", requestTxHash: log.transactionHash!, requestedAt: new Date(Number(blocks.get(log.blockNumber!.toString())!.timestamp) * 1000), updatedAt: new Date() }).where(eq(campaignPayoutRequests.id, request.id));
          }
        }
        if (log.eventName === "DisbursementApproved" || log.eventName === "DisbursementRejected") {
          const requestHash = String(args.requestHash).toLowerCase();
          const binding = bindings.get(String(args.campaignId));
          const [request] = await tx.select().from(campaignPayoutRequests).where(and(
            eq(campaignPayoutRequests.campaignId, binding?.campaignId ?? ""),
            eq(campaignPayoutRequests.streamId, streamId),
            eq(campaignPayoutRequests.requestHash, requestHash),
          ));
          if (request) {
            const [decision] = await tx.select().from(campaignPayoutDecisions).where(and(
              eq(campaignPayoutDecisions.requestId, request.id), eq(campaignPayoutDecisions.decisionHash, String(args.decisionHash).toLowerCase()),
            ));
            const status = log.eventName === "DisbursementApproved" ? "APPROVED" : decision?.outcome === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "REJECTED";
            await tx.update(campaignPayoutRequests).set({ status, decisionHash: String(args.decisionHash).toLowerCase(), decisionTxHash: log.transactionHash!, updatedAt: new Date() }).where(eq(campaignPayoutRequests.id, request.id));
            if (decision) await tx.update(campaignPayoutDecisions).set({ txHash: log.transactionHash! }).where(eq(campaignPayoutDecisions.id, decision.id));
          }
        }
        if (log.eventName === "SurplusClaimed") {
          const binding = bindings.get(String(args.campaignId));
          const wallet = String(args.backer).toLowerCase();
          const [link] = await tx.select().from(walletLinks).where(and(eq(walletLinks.chainId, String(manifest.chainId)), eq(walletLinks.address, wallet)));
          const choice = Number(args.choice) === 0 ? "REFUND_TO_BACKER" : Number(args.choice) === 1 ? "DONATE_TO_CREATOR" : null;
          if (binding && choice && BigInt(String(args.amount)) > 0n) {
            await tx.insert(campaignSurplusClaims).values({
              campaignId: binding.campaignId, streamId, backerUserId: link?.userId ?? null, backerWallet: wallet,
              choice, recipient: String(args.recipient).toLowerCase(), amount: String(args.amount), transactionHash: log.transactionHash!,
              logIndex: log.logIndex!, blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(), canonical: true,
            }).onConflictDoUpdate({ target: [campaignSurplusClaims.streamId, campaignSurplusClaims.transactionHash, campaignSurplusClaims.logIndex], set: {
              campaignId: binding.campaignId, backerUserId: sql`COALESCE(${campaignSurplusClaims.backerUserId}, ${link?.userId ?? null})`,
              backerWallet: wallet, choice, recipient: String(args.recipient).toLowerCase(), amount: String(args.amount), blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(), canonical: true,
            } });
          }
        }
      }
      const settlementCampaignIds = new Set(decoded.filter(log => ["DisbursementRequested", "DisbursementApproved", "DisbursementRejected", "CompletionRequested", "CompletionApproved", "CompletionRejected", "SurplusClaimed"].includes(log.eventName)).map(log => String((log.args as Record<string, unknown>).campaignId)));
      for (const onchainCampaignId of settlementCampaignIds) {
        const binding = bindings.get(onchainCampaignId);
        if (!binding) continue;
        const snapshot = jsonSafe<CampaignChainSnapshot>(await client.readContract({ address: manifest.contractAddress, abi: campaignAbi, functionName: "campaign", args: [BigInt(onchainCampaignId)], blockNumber: head.number }));
        binding.snapshot = snapshot;
        await tx.update(campaignChainCampaigns).set({ snapshot, canonical: true }).where(and(
          eq(campaignChainCampaigns.streamId, streamId), eq(campaignChainCampaigns.onchainCampaignId, onchainCampaignId),
        ));
      }
      // Re-check the anchored head before committing derived rights. Failure rolls everything back.
      if ((await client.getBlock({ blockNumber: head.number })).hash !== head.hash) throw new Error("Campaign chain changed during synchronization");
      await tx.update(indexerStreams).set({ lastBlock: head.number.toString(), lastBlockHash: head.hash, headBlock: head.number.toString(), status: "ready", error: null, updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
      return { blockNumber: head.number.toString(), events: decoded.length, entitlements };
    });
  }
}
