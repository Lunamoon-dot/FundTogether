import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPublicClient, decodeFunctionData, defineChain, http, parseEventLogs } from "viem";
import type { PublicClient } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  campaigns,
  historicalEntitlements,
  campaignTiers,
  historicalCampaignProjection,
  indexerStreams,
  chainEvents,
  users,
  walletLinks,
  creatorProfiles,
  platformRoles,
} from "../database/schema";
import historicalCampaignAbiJson = require("../blockchain/generated/fundtogether/fund-together-historical-campaign.abi.json");
import { randomBytes } from "node:crypto";

export interface SyncResult {
  fromBlock: bigint;
  toBlock: bigint;
  logsProcessed: number;
  entitlementsCreated: number;
  digitalKeysIssued: number;
}

export const HISTORICAL_TRANSACTION_ACTIONS = [
  "pledge",
  "activateCampaign",
  "takeOverEligibility",
  "finalizeFundingFailure",
  "submitDisbursementRequest",
  "approveAndDisburse",
  "candidateExpenditure",
  "finalizeExpenditure",
  "returnFunds",
  "openDisputeCase",
  "upholdDisputeCase",
  "recordProductionVerified",
  "recordFulfillmentComplete",
  "completeCampaign",
  "startWindDown",
  "claimRefund",
] as const;
export type HistoricalTransactionAction = typeof HISTORICAL_TRANSACTION_ACTIONS[number];

const HISTORICAL_EVENT_BY_ACTION: Record<HistoricalTransactionAction, string> = {
  pledge: "CampaignPledged",
  activateCampaign: "CampaignActivated",
  takeOverEligibility: "EligibilityTakenOver",
  finalizeFundingFailure: "FundingFailed",
  submitDisbursementRequest: "DisbursementRequestSubmitted",
  approveAndDisburse: "RequestApprovedAndDisbursed",
  candidateExpenditure: "ExpenditureCandidate",
  finalizeExpenditure: "ExpenditureSettled",
  returnFunds: "FundsReturned",
  openDisputeCase: "DisputeCaseOpened",
  upholdDisputeCase: "DisputeCaseUpheld",
  recordProductionVerified: "ProductionVerified",
  recordFulfillmentComplete: "FulfillmentComplete",
  completeCampaign: "CampaignCompleted",
  startWindDown: "WindDownStarted",
  claimRefund: "RefundClaimed",
};

const HISTORICAL_RESOLVER_ACTIONS = new Set<HistoricalTransactionAction>([
  "activateCampaign", "takeOverEligibility", "approveAndDisburse", "candidateExpenditure",
  "finalizeExpenditure", "upholdDisputeCase", "recordProductionVerified",
  "recordFulfillmentComplete", "startWindDown",
]);

const HISTORICAL_CREATOR_ACTIONS = new Set<HistoricalTransactionAction>([
  "submitDisbursementRequest", "returnFunds",
]);

const HISTORICAL_CREATOR_OR_RESOLVER_ACTIONS = new Set<HistoricalTransactionAction>([
  "completeCampaign",
]);

@Injectable()
export class HistoricalCampaignIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HistoricalCampaignIndexerService.name);
  private client: PublicClient | null = null;
  private historicalCampaignAddress: `0x${string}` = "0x0000000000000000000000000000000000000000";
  private rpcUrl: string = "";
  private readonly chainId: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private stopped = false;
  private runningPromise: Promise<SyncResult> | null = null;

  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {
    this.rpcUrl = process.env.FUNDTOGETHER_RPC_URL || "http://127.0.0.1:9548";
    this.chainId = Number(process.env.CHAIN_ID) || 31339;
    const chain = defineChain({
      id: this.chainId,
      name: "FundTogether Local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [this.rpcUrl] } },
    });
    const fetchOptions = process.env.NODE_ENV === "test"
      ? { headers: { Connection: "close" } }
      : undefined;
    this.client = createPublicClient({
      chain,
      transport: http(this.rpcUrl, fetchOptions ? { fetchOptions } : undefined),
    });

    if (process.env.FUNDTOGETHER_CONTRACT_ADDRESS) {
      this.historicalCampaignAddress = process.env.FUNDTOGETHER_CONTRACT_ADDRESS as `0x${string}`;
    }
  }

  onModuleInit() {
    this.stopped = false;
    const pollEnabled = process.env.FUNDTOGETHER_INDEXER_POLL_ENABLED === "true" ||
      (process.env.NODE_ENV !== "test" && process.env.FUNDTOGETHER_INDEXER_POLL_ENABLED !== "false");
    if (!pollEnabled) return;

    const intervalMs = Number(process.env.FUNDTOGETHER_INDEXER_POLL_MS) || 4000;
    this.pollTimer = setInterval(() => {
      if (this.stopped) return;
      void this.syncFromChain().catch(err => {
        this.logger.debug(`Campaign background poll skipped: ${err.message}`);
      });
    }, intervalMs);
    if (typeof (this.pollTimer as any)?.unref === "function") {
      (this.pollTimer as any).unref();
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.runningPromise) {
      await this.runningPromise.catch(() => undefined);
      this.runningPromise = null;
    }
  }

  setContractAddress(address: `0x${string}`) {
    this.historicalCampaignAddress = address;
  }

  getContractAddress(): `0x${string}` | undefined {
    const addr = (this.historicalCampaignAddress !== "0x0000000000000000000000000000000000000000"
      ? this.historicalCampaignAddress
      : process.env.FUNDTOGETHER_CONTRACT_ADDRESS) as `0x${string}` | undefined;
    if (!addr || addr === "0x0000000000000000000000000000000000000000") {
      return undefined;
    }
    return addr;
  }

  getRpcUrl(): string | undefined {
    const url = this.rpcUrl || process.env.FUNDTOGETHER_RPC_URL;
    return url && url.trim().length > 0 ? url.trim() : undefined;
  }

  setClient(client: PublicClient) {
    this.client = client;
  }

  getClient(): PublicClient | null {
    return this.client;
  }

  /**
   * Background / manual block scanner that pulls all logs emitted by the registered
   * FundTogether contract from last indexed block + 1 up to current headBlock.
   */
  async runOnce(): Promise<SyncResult> {
    return this.syncFromChain();
  }

  async syncFromChain(): Promise<SyncResult> {
    if (this.runningPromise) {
      return this.runningPromise;
    }
    const contractAddress = this.getContractAddress();
    if (!this.client || !contractAddress || this.isSyncing || this.stopped) {
      return { fromBlock: 0n, toBlock: 0n, logsProcessed: 0, entitlementsCreated: 0, digitalKeysIssued: 0 };
    }

    this.isSyncing = true;
    this.runningPromise = (async () => {
      try {
        const activeAddress = contractAddress.toLowerCase();
        const streamId = `CAMPAIGNS:${this.chainId}:${activeAddress}`;
        const headBlock = await this.client!.getBlockNumber({ cacheTime: 0 });
        const endBlockObj = await this.client!.getBlock({ blockNumber: headBlock });
        const endBlockHash = (endBlockObj.hash ?? ("0x" + "0".repeat(64))) as `0x${string}`;

        let fromBlock = 0n;
        let reorgDetected = false;

        const [streamRow] = await this.db.select().from(indexerStreams)
          .where(eq(indexerStreams.streamId, streamId));

        if (streamRow && streamRow.lastBlock !== null) {
          const prevBlockNum = BigInt(streamRow.lastBlock);
          if (prevBlockNum > headBlock) {
            this.logger.warn(`Reorg detected on ${streamId}: lastBlock ${prevBlockNum} > headBlock ${headBlock}`);
            reorgDetected = true;
          } else if (
            streamRow.lastBlockHash &&
            streamRow.lastBlockHash !== "0x" + "0".repeat(64)
          ) {
            try {
              const onchainBlock = await this.client!.getBlock({ blockNumber: prevBlockNum });
              if (!onchainBlock.hash || onchainBlock.hash.toLowerCase() !== streamRow.lastBlockHash.toLowerCase()) {
                this.logger.warn(
                  `Reorg detected at block ${prevBlockNum}: expected ${streamRow.lastBlockHash}, got ${onchainBlock.hash}`
                );
                reorgDetected = true;
              } else {
                fromBlock = prevBlockNum + 1n;
              }
            } catch {
              reorgDetected = true;
            }
          } else {
            fromBlock = prevBlockNum + 1n;
          }
        }

        // Also check canonical chain_events block hashes in DB in case receipts were indexed out-of-band or deeper blocks reorged
        if (!reorgDetected) {
          const existingEvents = await this.db.select().from(chainEvents)
            .where(and(eq(chainEvents.streamId, streamId), eq(chainEvents.canonical, true)));
          const checkedBlocks = new Map<string, string>();
          for (const ev of existingEvents) {
            if (ev.blockHash && ev.blockHash !== "0x" + "0".repeat(64)) {
              checkedBlocks.set(ev.blockNumber, ev.blockHash);
            }
          }
          for (const [bNumStr, expectedHash] of checkedBlocks.entries()) {
            const bNum = BigInt(bNumStr);
            if (bNum > headBlock) {
              this.logger.warn(`Reorg detected on ${streamId}: canonical event block ${bNum} > headBlock ${headBlock}`);
              reorgDetected = true;
              break;
            }
            try {
              const bObj = await this.client!.getBlock({ blockNumber: bNum });
              if (!bObj.hash || bObj.hash.toLowerCase() !== expectedHash.toLowerCase()) {
                this.logger.warn(`Reorg detected on ${streamId} at event block ${bNum}: expected ${expectedHash}, got ${bObj.hash}`);
                reorgDetected = true;
                break;
              }
            } catch {
              reorgDetected = true;
              break;
            }
          }
        }

        if (reorgDetected) {
          // 1. Invalidate all previously recorded events on this stream (canonical = false)
          await this.db.update(chainEvents)
            .set({ canonical: false })
            .where(eq(chainEvents.streamId, streamId));

          // 2. Delete stale projections so they are cleanly rebuilt from canonical chain
          await this.db.delete(historicalCampaignProjection)
            .where(eq(historicalCampaignProjection.streamId, streamId));

          // 3. Replay from genesis block 0n
          fromBlock = 0n;
        }

        let logsProcessed = 0;
        let entitlementsCreated = 0;
        let digitalKeysIssued = 0;

        if (fromBlock <= headBlock) {
          const rawLogs = await this.client!.getLogs({
            address: contractAddress,
            fromBlock,
            toBlock: headBlock,
          });

          rawLogs.sort(
            (a, b) =>
              Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
              ((a.transactionIndex ?? 0) - (b.transactionIndex ?? 0)) ||
              ((a.logIndex ?? 0) - (b.logIndex ?? 0))
          );

          const parsedLogs = parseEventLogs({
            abi: historicalCampaignAbiJson as any,
            logs: rawLogs,
            strict: false,
          });
          logsProcessed = parsedLogs.length;

          if (parsedLogs.length > 0) {
            const res = await this.processEvents(
              parsedLogs as any,
              undefined,
              contractAddress,
              headBlock,
              endBlockHash,
              false
            );
            entitlementsCreated = res.entitlementsCreated;
            digitalKeysIssued = res.digitalKeysIssued;
          }
        }

        if (reorgDetected) {
          await this.reconcileOrphanedState(streamId, contractAddress, headBlock);
        }

        // Verify headBlock hash did not change mid-batch before saving checkpoint
        const verifyEndBlock = await this.client!.getBlock({ blockNumber: headBlock });
        if (verifyEndBlock.hash && verifyEndBlock.hash.toLowerCase() !== endBlockHash.toLowerCase()) {
          throw new Error("FundTogether chain head changed during batch synchronization");
        }

        // Commit exact block-aligned checkpoint (headBlock + endBlockHash belong to the exact same block)
        await this.db.insert(schema.indexerStreams).values({
          streamId,
          lastBlock: headBlock.toString(),
          lastBlockHash: endBlockHash,
          headBlock: headBlock.toString(),
          status: "synced",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: schema.indexerStreams.streamId,
          set: {
            lastBlock: headBlock.toString(),
            lastBlockHash: endBlockHash,
            headBlock: headBlock.toString(),
            status: "synced",
            updatedAt: new Date(),
          },
        });

        return {
          fromBlock,
          toBlock: headBlock,
          logsProcessed,
          entitlementsCreated,
          digitalKeysIssued,
        };
      } finally {
        this.isSyncing = false;
        this.runningPromise = null;
      }
    })();

    return this.runningPromise;
  }

  /**
   * Process a confirmed transaction receipt directly for verified, event-filtered synchronization.
   * STRICTLY FILTERS BY DEPLOYMENT ADDRESS to prevent cross-contract event spoofing.
   */
  async processReceipt(txHash: `0x${string}`) {
    if (!this.client) throw new Error("Chain client not initialized");

    const contractAddress = this.getContractAddress();
    if (!contractAddress) {
      throw new Error("Registered FundTogether contract address required before processing receipts");
    }

    const receipt = await this.client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} reverted or not found on-chain`);
    }

    // STRICT P0 CHECK: Filter logs to ensure they originate ONLY from this registered FundTogether contract
    const targetAddress = contractAddress.toLowerCase();
    const contractLogs = receipt.logs.filter(
      log => log.address.toLowerCase() === targetAddress
    );

    if (contractLogs.length === 0) {
      this.logger.warn(`Transaction receipt ${txHash} contains 0 events from registered FundTogether contract ${contractAddress}`);
      return { entitlementsCreated: 0, digitalKeysIssued: 0, eventsProcessed: 0 };
    }

    const parsedLogs = parseEventLogs({
      abi: historicalCampaignAbiJson as any,
      logs: contractLogs,
      strict: false,
    });

    const result = await this.processEvents(
      parsedLogs as any,
      txHash,
      contractAddress,
      receipt.blockNumber,
      receipt.blockHash,
      false
    );
    return { ...result, eventsProcessed: parsedLogs.length };
  }

  /**
   * Verify a legacy receipt against the authenticated actor, bound campaign and
   * submitted action before allowing the receipt to mutate projections.
   */
  async processExpectedReceipt(input: {
    txHash: string;
    campaignId: string;
    action: HistoricalTransactionAction;
    userId: string;
  }) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }
    if (!this.client) throw new Error("Chain client not initialized");
    const contractAddress = this.getContractAddress();
    if (!contractAddress) throw new Error("Registered FundTogether contract address required before processing receipts");

    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
    } catch (error) {
      if ((error as { name?: string }).name?.includes("TransactionReceiptNotFound")) {
        return { txHash: input.txHash, state: "PENDING" as const };
      }
      throw error;
    }
    if (receipt.status !== "success") return { txHash: input.txHash, state: "REVERTED" as const };

    const canonicalBlock = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    if (!canonicalBlock.hash || canonicalBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    const transaction = await this.client.getTransaction({ hash: input.txHash as `0x${string}` });
    if (!transaction.to || transaction.to.toLowerCase() !== contractAddress.toLowerCase()) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    let decoded: { functionName: string; args?: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: historicalCampaignAbiJson as any, data: transaction.input });
    } catch {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }
    if (decoded.functionName !== input.action) return { txHash: input.txHash, state: "UNRELATED" as const };

    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, input.campaignId));
    if (!campaign?.onchainCampaignId) return { txHash: input.txHash, state: "UNRELATED" as const };
    const actor = transaction.from.toLowerCase();
    const [linkedWallet] = await this.db.select().from(walletLinks).where(and(
      eq(walletLinks.userId, input.userId), eq(walletLinks.chainId, String(this.chainId)), eq(walletLinks.address, actor),
    ));
    if (!linkedWallet) return { txHash: input.txHash, state: "UNRELATED" as const };

    const resolverAction = HISTORICAL_RESOLVER_ACTIONS.has(input.action) || HISTORICAL_CREATOR_OR_RESOLVER_ACTIONS.has(input.action);
    let resolverActor = false;
    if (resolverAction) {
      const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, input.userId));
      const primary = await this.client.readContract({ address: contractAddress, abi: historicalCampaignAbiJson as any, functionName: "resolver" }) as string;
      const backup = await this.client.readContract({ address: contractAddress, abi: historicalCampaignAbiJson as any, functionName: "backupResolver" }) as string;
      resolverActor = Boolean(role?.roles.includes("RESOLVER") && [primary, backup].some(address => address.toLowerCase() === actor));
      if (!resolverActor && HISTORICAL_RESOLVER_ACTIONS.has(input.action)) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
    }

    if (HISTORICAL_CREATOR_ACTIONS.has(input.action)) {
      const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, campaign.creatorUserId));
      const [studioWallet] = profile?.studioWalletLinkId ? await this.db.select().from(walletLinks).where(and(
        eq(walletLinks.id, profile.studioWalletLinkId), eq(walletLinks.userId, campaign.creatorUserId),
      )) : [];
      if (campaign.creatorUserId !== input.userId || !studioWallet || studioWallet.address.toLowerCase() !== actor) {
        return { txHash: input.txHash, state: "UNRELATED" as const };
      }
    }
    if (HISTORICAL_CREATOR_OR_RESOLVER_ACTIONS.has(input.action) && input.userId !== campaign.creatorUserId && !resolverActor) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    const args = [...(decoded.args ?? [])];
    if (String(args[0]) !== String(campaign.onchainCampaignId)) {
      return { txHash: input.txHash, state: "UNRELATED" as const };
    }

    const contractLogs = receipt.logs.filter(log => log.address.toLowerCase() === contractAddress.toLowerCase());
    const events = parseEventLogs({ abi: historicalCampaignAbiJson as any, logs: contractLogs, strict: false }) as any[];
    const expectedEvent = HISTORICAL_EVENT_BY_ACTION[input.action];
    const matchingEvent = events.find(event => {
      if (event.eventName !== expectedEvent) return false;
      const eventArgs = event.args as Record<string, unknown>;
      if (String(eventArgs.campaignId) !== String(campaign.onchainCampaignId)) return false;
      if (["CampaignPledged", "DisputeCaseOpened", "RefundClaimed"].includes(expectedEvent)) {
        return String(eventArgs.backer).toLowerCase() === actor;
      }
      return true;
    });
    if (!matchingEvent) return { txHash: input.txHash, state: "UNRELATED" as const };

    const result = await this.processReceipt(input.txHash as `0x${string}`);
    return { ...result, txHash: input.txHash, state: "ON_CHAIN_CONFIRMED" as const };
  }

  /**
   * Process decoded on-chain events and idempotently project state into PostgreSQL.
   * Records stream checkpoint and canonical chain_events.
   */
  async processEvents(
    events: Array<{ eventName: string; args: any; logIndex?: number; transactionHash?: string; blockNumber?: bigint; blockHash?: `0x${string}` }>,
    fallbackTxHash?: string,
    contractAddress?: `0x${string}`,
    blockNumber?: bigint,
    blockHash?: `0x${string}`,
    updateStreamCheckpoint: boolean = true
  ) {
    let entitlementsCreated = 0;
    let digitalKeysIssued = 0;

    const registeredAddress = this.getContractAddress();

    if (registeredAddress && contractAddress && contractAddress.toLowerCase() !== registeredAddress.toLowerCase()) {
      this.logger.warn(`processEvents rejected events from unauthorized contract address: ${contractAddress}`);
      return { entitlementsCreated: 0, digitalKeysIssued: 0 };
    }

    const bNum = blockNumber ?? 1n;
    const bHash = blockHash ?? (("0x" + "0".repeat(64)) as `0x${string}`);
    const activeAddress = (contractAddress || registeredAddress || this.historicalCampaignAddress).toLowerCase();
    const streamId = `CAMPAIGNS:${this.chainId}:${activeAddress}`;

    // Ensure indexerStreams row exists; only overwrite lastBlock/lastBlockHash when updateStreamCheckpoint is true
    if (updateStreamCheckpoint) {
      await this.db.insert(schema.indexerStreams).values({
        streamId,
        lastBlock: bNum.toString(),
        lastBlockHash: bHash,
        headBlock: bNum.toString(),
        status: "synced",
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.indexerStreams.streamId,
        set: {
          lastBlock: bNum.toString(),
          lastBlockHash: bHash,
          headBlock: bNum.toString(),
          status: "synced",
          updatedAt: new Date(),
        },
      });
    } else {
      await this.db.insert(schema.indexerStreams).values({
        streamId,
        status: "syncing",
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }

    const findCampaign = async (onchainId: string) => {
      const q = this.db.select().from(campaigns)
        .where(eq(campaigns.onchainCampaignId, onchainId));
      const [camp] = typeof (q as any)?.orderBy === "function"
        ? await (q as any).orderBy(sql`${campaigns.createdAt} DESC`).limit(1)
        : await q;
      return camp;
    };

    for (const event of events) {
      const txHash = event.transactionHash || fallbackTxHash || "0x" + "0".repeat(64);
      const logIdx = event.logIndex ?? 0;
      const evBlockNum = event.blockNumber ?? bNum;
      const evBlockHash = event.blockHash ?? bHash;

      // Helper to serialize BigInts safely for JSON/jsonb columns
      const serializeBigInts = (val: any): any => {
        if (val === null || val === undefined) return val;
        if (typeof val === "bigint") return val.toString();
        if (Array.isArray(val)) return val.map(serializeBigInts);
        if (typeof val === "object") {
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(val)) {
            out[k] = serializeBigInts(v);
          }
          return out;
        }
        return val;
      };

      // Record canonical event in chain_events (re-marking canonical=true on replay if block matches)
      await this.db.insert(schema.chainEvents).values({
        streamId,
        transactionHash: txHash,
        logIndex: logIdx,
        blockHash: evBlockHash,
        blockNumber: evBlockNum.toString(),
        eventName: event.eventName,
        args: serializeBigInts(event.args),
        canonical: true,
      }).onConflictDoUpdate({
        target: [
          schema.chainEvents.streamId,
          schema.chainEvents.transactionHash,
          schema.chainEvents.logIndex,
          schema.chainEvents.blockHash,
        ],
        set: { canonical: true },
      });

      switch (event.eventName) {
        case "CampaignCreated": {
          const { campaignId, commitmentHash } = event.args;
          const onchainId = campaignId.toString();

          // registerOnchain binds the requested metadata record before its
          // receipt is synchronized. Prefer that unambiguous mapping over a
          // potentially duplicated content commitment.
          let [existing] = await this.db.select().from(campaigns)
            .where(eq(campaigns.onchainCampaignId, onchainId));
          if (!existing) {
            [existing] = await this.db.select().from(campaigns)
              .where(eq(campaigns.commitmentHash, commitmentHash));
          }

          if (existing) {
            await this.db.update(campaigns).set({
              onchainCampaignId: onchainId,
              status: "PUBLISHED",
              updatedAt: new Date(),
            }).where(eq(campaigns.id, existing.id));

            await this.updateProjection(streamId, onchainId, existing.id, "PUBLISHED", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
            this.logger.log(`Linked on-chain campaign #${onchainId} to DB campaign ${existing.id}`);
          }
          break;
        }

        case "CampaignPledged": {
          const { campaignId, backer, tierId, quantity, amount } = event.args;
          const onchainId = campaignId.toString();
          const tierIndex = Number(tierId);
          const pledgeQty = Number(quantity);
          const amountPaid = amount.toString();
          const backerWallet = (backer as string).toLowerCase();

          const campaign = await findCampaign(onchainId);
          if (!campaign) {
            this.logger.warn(`Campaign #${onchainId} not found in DB for pledge event`);
            continue;
          }

          const [tier] = await this.db.select().from(campaignTiers)
            .where(and(eq(campaignTiers.campaignId, campaign.id), eq(campaignTiers.tierIndex, tierIndex)));
          if (!tier) {
            this.logger.warn(`Tier #${tierIndex} for campaign ${campaign.id} not found`);
            continue;
          }

          // Find or create backer user
          const [walletLink] = await this.db.select().from(walletLinks)
            .where(and(eq(walletLinks.address, backerWallet), eq(walletLinks.chainId, String(this.chainId))));
          let backerUserId: string;

          if (walletLink) {
            backerUserId = walletLink.userId;
          } else {
            const [newUser] = await this.db.insert(users).values({}).returning();
            await this.db.insert(walletLinks).values({
              userId: newUser.id,
              chainId: String(this.chainId),
              address: backerWallet,
              isPrimary: true,
            });
            backerUserId = newUser.id;
          }

          // Insert with onConflictDoNothing to eliminate race-conditions and duplicate allocations
          const inserted = await this.db.transaction(async tx => {
            const [insertedRow] = await tx.insert(historicalEntitlements).values({
              campaignId: campaign.id,
              tierId: tier.id,
              onchainTierIndex: tierIndex,
              backerUserId,
              backerWallet,
              quantity: pledgeQty,
              amountPaid,
              txHash,
              logIndex: logIdx,
              status: "ACTIVE",
              digitalAccessCode: null, // Gated until PRODUCTION_VERIFIED
            }).onConflictDoNothing({ target: [historicalEntitlements.txHash, historicalEntitlements.logIndex] }).returning();

            if (insertedRow) {
              await tx.update(campaignTiers)
                .set({ pledgedQuantity: sql`${campaignTiers.pledgedQuantity} + ${pledgeQty}` })
                .where(eq(campaignTiers.id, tier.id));
            }
            return insertedRow;
          });

          if (inserted) {
            entitlementsCreated++;
            this.logger.log(`Indexed CampaignPledged: backer ${backerWallet}, tier ${tierIndex}, qty ${pledgeQty}`);
            await this.updateProjection(streamId, onchainId, campaign.id, campaign.status, event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          }
          break;
        }

        case "CampaignActivated": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();
          const campaign = await findCampaign(onchainId);
          if (campaign) {
            await this.db.update(campaigns).set({
              status: "ACTIVE",
              updatedAt: new Date(),
            }).where(eq(campaigns.id, campaign.id));
            await this.updateProjection(streamId, onchainId, campaign.id, "ACTIVE", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          }
          break;
        }

        case "ProductionVerified": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(campaigns).set({
            status: "PRODUCTION_VERIFIED",
            updatedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));

          // GATED ACTIVATION: Issue digital access codes now that production is verified
          const digitalEntitlements = await this.db.select({
            entitlementId: historicalEntitlements.id,
            isDigital: campaignTiers.isDigital,
          })
          .from(historicalEntitlements)
          .innerJoin(campaignTiers, eq(historicalEntitlements.tierId, campaignTiers.id))
          .where(and(
            eq(historicalEntitlements.campaignId, campaign.id),
            eq(campaignTiers.isDigital, true),
            sql`${historicalEntitlements.digitalAccessCode} IS NULL`
          ));

          for (const item of digitalEntitlements) {
            const key = `COMIC-READ-${randomBytes(4).toString("hex").toUpperCase()}-${Date.now().toString().slice(-4)}`;
            await this.db.update(historicalEntitlements).set({
              digitalAccessCode: key,
              updatedAt: new Date(),
            }).where(eq(historicalEntitlements.id, item.entitlementId));
            digitalKeysIssued++;
          }

          await this.updateProjection(streamId, onchainId, campaign.id, "PRODUCTION_VERIFIED", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          this.logger.log(`Production verified for #${onchainId}: issued ${digitalKeysIssued} digital access keys.`);
          break;
        }

        case "FulfillmentComplete": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(campaigns).set({
            status: "FULFILLMENT_COMPLETE",
            updatedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));

          await this.updateProjection(streamId, onchainId, campaign.id, "FULFILLMENT_COMPLETE", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          this.logger.log(`Fulfillment complete verified for #${onchainId}`);
          break;
        }

        case "CampaignCompleted": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(campaigns).set({
            status: "COMPLETED",
            updatedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));

          await this.updateProjection(streamId, onchainId, campaign.id, "COMPLETED", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          this.logger.log(`Campaign completed on-chain for #${onchainId}`);
          break;
        }

        case "FundingFailed":
        case "WindDownStarted": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(campaigns).set({
            status: "STOPPED",
            updatedAt: new Date(),
          }).where(eq(campaigns.id, campaign.id));

          await this.db.update(historicalEntitlements).set({
            status: "REFUND_ELIGIBLE",
            updatedAt: new Date(),
          }).where(and(
            eq(historicalEntitlements.campaignId, campaign.id),
            sql`${historicalEntitlements.status} IN ('ACTIVE', 'REDEEM_REQUESTED')`
          ));

          await this.updateProjection(streamId, onchainId, campaign.id, "STOPPED", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          break;
        }

        case "RefundClaimed": {
          const { campaignId, backer } = event.args;
          const onchainId = campaignId.toString();
          const backerWallet = (backer as string).toLowerCase();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(historicalEntitlements).set({
            status: "REFUNDED",
            updatedAt: new Date(),
          }).where(and(
            eq(historicalEntitlements.campaignId, campaign.id),
            eq(historicalEntitlements.backerWallet, backerWallet)
          ));

          await this.updateProjection(streamId, onchainId, campaign.id, "STOPPED", event.eventName, txHash, evBlockNum, serializeBigInts(event.args));
          break;
        }

        case "EligibilityTakenOver":
        case "DisbursementRequestSubmitted":
        case "RequestApprovedAndDisbursed":
        case "RequestApprovalTakenOver":
        case "RequestCancelled":
        case "ExpenditureCandidate":
        case "ExpenditureReviewTakenOver":
        case "ExpenditureSettled":
        case "DisputeCaseOpened":
        case "DisputeCaseUpheld":
        case "DisputeCaseTakenOver":
        case "FundsReturned":
        case "ExpenditureAuthorizationInvalidated": {
          const campaignIdArg = event.args?.campaignId;
          if (campaignIdArg !== undefined) {
            const onchainId = campaignIdArg.toString();
            const campaign = await findCampaign(onchainId);
            if (campaign) {
              await this.updateProjection(
                streamId,
                onchainId,
                campaign.id,
                campaign.status,
                event.eventName,
                txHash,
                evBlockNum,
                serializeBigInts(event.args)
              );
            }
          }
          break;
        }
      }
    }

    return { entitlementsCreated, digitalKeysIssued };
  }

  /**
   * Reconciles database campaign statuses, entitlements, tier quantities, digital access keys,
   * and projections after a chain reorg by removing orphaned entitlements and aligning state
   * with canonical chain events and live contract reads.
   */
  private async reconcileOrphanedState(
    streamId: string,
    contractAddress: `0x${string}`,
    headBlock: bigint
  ) {
    const orphanedEvents = await this.db.select().from(chainEvents)
      .where(and(eq(chainEvents.streamId, streamId), eq(chainEvents.canonical, false)));
    const canonicalEvents = await this.db.select().from(chainEvents)
      .where(and(eq(chainEvents.streamId, streamId), eq(chainEvents.canonical, true)));

    const canonicalTxLogs = new Set(
      canonicalEvents.map(e => `${e.transactionHash.toLowerCase()}:${e.logIndex}`)
    );

    const touchedOnchainIds = new Set<string>();
    const touchedCommitments = new Set<string>();

    for (const ev of [...orphanedEvents, ...canonicalEvents]) {
      const args = (ev.args ?? {}) as Record<string, any>;
      if (args.campaignId !== undefined) {
        touchedOnchainIds.add(String(args.campaignId));
      }
      if (typeof args.commitmentHash === "string") {
        touchedCommitments.add(args.commitmentHash.toLowerCase());
      }
    }

    // 1. Delete entitlements created by orphaned CampaignPledged events
    for (const orph of orphanedEvents) {
      if (orph.eventName === "CampaignPledged") {
        const key = `${orph.transactionHash.toLowerCase()}:${orph.logIndex}`;
        if (!canonicalTxLogs.has(key)) {
          const orphEnts = await this.db.select().from(historicalEntitlements)
            .where(and(
              eq(historicalEntitlements.txHash, orph.transactionHash),
              eq(historicalEntitlements.logIndex, orph.logIndex)
            ));
          for (const ent of orphEnts) {
            await this.db.delete(schema.historicalDisputes)
              .where(eq(schema.historicalDisputes.entitlementId, ent.id));
            await this.db.delete(historicalEntitlements)
              .where(eq(historicalEntitlements.id, ent.id));
            this.logger.warn(`Removed orphaned entitlement ${ent.id} from non-canonical tx ${orph.transactionHash}`);
          }
        }
      }
    }

    if (!this.client) return;

    let nextCampaignId = 0n;
    try {
      nextCampaignId = (await this.client.readContract({
        address: contractAddress,
        abi: historicalCampaignAbiJson as any,
        functionName: "nextCampaignId",
      })) as bigint;
    } catch {
      return;
    }

    // 2. Reconcile campaigns touched by this stream
    const allLinkedCampaigns = await this.db.select().from(campaigns)
      .where(sql`${campaigns.onchainCampaignId} IS NOT NULL`);

    for (const camp of allLinkedCampaigns) {
      const onchainIdStr = camp.onchainCampaignId!;
      const commitmentLower = camp.commitmentHash?.toLowerCase() ?? "";
      if (!touchedOnchainIds.has(onchainIdStr) && !touchedCommitments.has(commitmentLower)) {
        continue;
      }

      const onchainIdBig = BigInt(onchainIdStr);
      let cData: any = null;
      if (onchainIdBig < nextCampaignId) {
        try {
          cData = await this.client.readContract({
            address: contractAddress,
            abi: historicalCampaignAbiJson as any,
            functionName: "campaign",
            args: [onchainIdBig],
          });
        } catch {
          cData = null;
        }
      }

      const onchainCreator = String(cData?.creator ?? cData?.[0] ?? "0x0000000000000000000000000000000000000000");
      const onchainCommitment = String(cData?.commitmentHash ?? cData?.[1] ?? "").toLowerCase();

      if (
        onchainIdBig >= nextCampaignId ||
        !cData ||
        onchainCreator === "0x0000000000000000000000000000000000000000" ||
        (commitmentLower && onchainCommitment !== commitmentLower)
      ) {
        // CampaignCreated itself was orphaned on-chain
        const campEnts = await this.db.select().from(historicalEntitlements)
          .where(eq(historicalEntitlements.campaignId, camp.id));
        for (const ent of campEnts) {
          await this.db.delete(schema.historicalDisputes)
            .where(eq(schema.historicalDisputes.entitlementId, ent.id));
          await this.db.delete(historicalEntitlements)
            .where(eq(historicalEntitlements.id, ent.id));
        }
        await this.db.update(campaignTiers)
          .set({ pledgedQuantity: 0 })
          .where(eq(campaignTiers.campaignId, camp.id));
        await this.db.delete(historicalCampaignProjection)
          .where(and(
            eq(historicalCampaignProjection.streamId, streamId),
            eq(historicalCampaignProjection.onchainCampaignId, onchainIdStr)
          ));
        await this.db.update(campaigns)
          .set({ status: "APPROVED", onchainCampaignId: null, updatedAt: new Date() })
          .where(eq(campaigns.id, camp.id));
        continue;
      }

      // Map canonical on-chain CampaignState enum (0=FUNDING, 1=ACTIVE, 2=PRODUCTION_VERIFIED, 3=FULFILLMENT_COMPLETE, 4=COMPLETED, 5=STOPPED)
      const onchainState = Number(cData.state ?? cData[7] ?? 0);
      const stateMap: Record<number, string> = {
        0: "PUBLISHED",
        1: "ACTIVE",
        2: "PRODUCTION_VERIFIED",
        3: "FULFILLMENT_COMPLETE",
        4: "COMPLETED",
        5: "STOPPED",
      };
      const canonicalStatus = stateMap[onchainState] ?? "PUBLISHED";

      await this.db.update(campaigns)
        .set({ status: canonicalStatus, updatedAt: new Date() })
        .where(eq(campaigns.id, camp.id));

      // If ProductionVerified was reorged out (onchainState < 2), revoke prematurely issued digital keys
      if (onchainState < 2) {
        await this.db.update(historicalEntitlements)
          .set({ digitalAccessCode: null, updatedAt: new Date() })
          .where(eq(historicalEntitlements.campaignId, camp.id));
      }

      // If WindDownStarted / RefundClaimed was reorged out (onchainState < 5), restore non-disputed entitlements to ACTIVE
      if (onchainState < 5) {
        const campEnts = await this.db.select().from(historicalEntitlements)
          .where(eq(historicalEntitlements.campaignId, camp.id));
        for (const ent of campEnts) {
          if (ent.status === "REFUND_ELIGIBLE" || ent.status === "REFUNDED") {
            const [resolvedDispute] = await this.db.select().from(schema.historicalDisputes)
              .where(and(
                eq(schema.historicalDisputes.entitlementId, ent.id),
                eq(schema.historicalDisputes.status, "RESOLVED_BACKER")
              ));
            if (!resolvedDispute) {
              await this.db.update(historicalEntitlements)
                .set({ status: "ACTIVE", updatedAt: new Date() })
                .where(eq(historicalEntitlements.id, ent.id));
            }
          }
        }
      }

      // Recalculate tier pledgedQuantity from remaining canonical entitlements
      const tiers = await this.db.select().from(campaignTiers)
        .where(eq(campaignTiers.campaignId, camp.id));
      for (const tier of tiers) {
        const tierEnts = await this.db.select().from(historicalEntitlements)
          .where(eq(historicalEntitlements.tierId, tier.id));
        const totalQty = tierEnts.reduce((acc, e) => acc + Number(e.quantity || 0), 0);
        await this.db.update(campaignTiers)
          .set({ pledgedQuantity: totalQty })
          .where(eq(campaignTiers.id, tier.id));
      }

      // Rebuild projection from latest canonical event for this campaign
      const campCanonicalEvents = canonicalEvents.filter(
        e => String((e.args as any)?.campaignId ?? "") === onchainIdStr ||
          (e.eventName === "CampaignCreated" && String((e.args as any)?.commitmentHash ?? "").toLowerCase() === commitmentLower)
      );
      const lastEv = campCanonicalEvents[campCanonicalEvents.length - 1];
      await this.updateProjection(
        streamId,
        onchainIdStr,
        camp.id,
        canonicalStatus,
        lastEv?.eventName ?? "CampaignCreated",
        lastEv?.transactionHash ?? ("0x" + "0".repeat(64)),
        BigInt(lastEv?.blockNumber ?? headBlock.toString()),
        (lastEv?.args as Record<string, any>) ?? undefined
      );
    }
  }

  private async updateProjection(
    streamId: string,
    onchainCampaignId: string,
    campaignId: string,
    status: string,
    lastEvent: string,
    lastTxHash: string,
    blockNumber: bigint,
    lastEventArgs?: Record<string, any>
  ) {
    try {
      let onchainSnapshot: Record<string, any> = {};
      const contractAddress = this.getContractAddress();
      if (this.client && contractAddress) {
        try {
          const cData = (await this.client.readContract({
            address: contractAddress,
            abi: historicalCampaignAbiJson as any,
            functionName: "campaign",
            args: [BigInt(onchainCampaignId)],
          })) as any;
          if (cData) {
            onchainSnapshot = {
              creator: cData.creator ?? cData[0],
              commitmentHash: cData.commitmentHash ?? cData[1],
              goal: String(cData.goal ?? cData[2] ?? "0"),
              onchainState: Number(cData.state ?? cData[7] ?? 0),
              contributed: String(cData.contributed ?? cData[8] ?? "0"),
              available: String(cData.available ?? cData[9] ?? "0"),
              grossPaid: String(cData.grossPaid ?? cData[10] ?? "0"),
              basePool: String(cData.basePool ?? cData[11] ?? "0"),
              supplementPool: String(cData.supplementPool ?? cData[12] ?? "0"),
              refunded: String(cData.refunded ?? cData[13] ?? "0"),
              productionReportHash: cData.productionReportHash ?? cData[15],
              fulfillmentReportHash: cData.fulfillmentReportHash ?? cData[16],
            };
          }
        } catch {
          // Non-fatal if contract read is mocked or unavailable during synthetic unit test
        }
      }

      const snapshotPayload = {
        onchainCampaignId,
        status,
        lastEvent,
        lastEventArgs: lastEventArgs ?? null,
        lastTxHash,
        blockNumber: blockNumber.toString(),
        ...onchainSnapshot,
        updatedAt: new Date().toISOString(),
      };

      await this.db.insert(historicalCampaignProjection).values({
        streamId,
        onchainCampaignId,
        campaignMetadataId: campaignId,
        snapshot: snapshotPayload,
      }).onConflictDoUpdate({
        target: [historicalCampaignProjection.streamId, historicalCampaignProjection.onchainCampaignId],
        set: {
          snapshot: snapshotPayload,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update campaign projection: ${err.message}`);
    }
  }
}

