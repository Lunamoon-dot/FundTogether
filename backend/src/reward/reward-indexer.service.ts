import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPublicClient, defineChain, http, parseEventLogs } from "viem";
import type { PublicClient } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  rewardCampaigns,
  rewardEntitlements,
  rewardTiers,
  rewardCampaignProjection,
  indexerStreams,
  chainEvents,
  users,
  walletLinks,
} from "../database/schema";
import rewardAbiJson = require("../blockchain/generated/reward/fund-together-reward.abi.json");
import { randomBytes } from "node:crypto";

export interface SyncRewardResult {
  fromBlock: bigint;
  toBlock: bigint;
  logsProcessed: number;
  entitlementsCreated: number;
  digitalKeysIssued: number;
}

@Injectable()
export class RewardIndexerService {
  private readonly logger = new Logger(RewardIndexerService.name);
  private client: PublicClient | null = null;
  private rewardContractAddress: `0x${string}` = "0x0000000000000000000000000000000000000000";
  private readonly chainId: number;

  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {
    const rpcUrl = process.env.HED_BLOCKCHAIN_RPC_URL || "http://127.0.0.1:9548";
    this.chainId = Number(process.env.CHAIN_ID) || 31339;
    const chain = defineChain({
      id: this.chainId,
      name: "FundTogether Local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    this.client = createPublicClient({ chain, transport: http(rpcUrl) });

    if (process.env.REWARD_CONTRACT_ADDRESS) {
      this.rewardContractAddress = process.env.REWARD_CONTRACT_ADDRESS as `0x${string}`;
    }
  }

  setContractAddress(address: `0x${string}`) {
    this.rewardContractAddress = address;
  }

  setClient(client: PublicClient) {
    this.client = client;
  }

  /**
   * Process a confirmed transaction receipt directly for verified, event-filtered synchronization.
   * STRICTLY FILTERS BY DEPLOYMENT ADDRESS to prevent cross-contract event spoofing.
   */
  async processReceipt(txHash: `0x${string}`) {
    if (!this.client) throw new Error("Chain client not initialized");

    const contractAddress = (this.rewardContractAddress !== "0x0000000000000000000000000000000000000000"
      ? this.rewardContractAddress
      : process.env.REWARD_CONTRACT_ADDRESS) as `0x${string}` | undefined;

    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("Registered Reward contract address required before processing receipts");
    }

    const receipt = await this.client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} reverted or not found on-chain`);
    }

    // STRICT P0 CHECK: Filter logs to ensure they originate ONLY from this registered Reward contract
    const targetAddress = contractAddress.toLowerCase();
    const contractLogs = receipt.logs.filter(
      log => log.address.toLowerCase() === targetAddress
    );

    if (contractLogs.length === 0) {
      this.logger.warn(`Transaction receipt ${txHash} contains 0 events from registered Reward contract ${contractAddress}`);
      return { entitlementsCreated: 0, digitalKeysIssued: 0 };
    }

    const parsedLogs = parseEventLogs({
      abi: rewardAbiJson as any,
      logs: contractLogs,
      strict: false,
    });

    return this.processEvents(
      parsedLogs as any,
      txHash,
      contractAddress,
      receipt.blockNumber,
      receipt.blockHash
    );
  }

  /**
   * Process decoded on-chain events and idempotently project state into PostgreSQL.
   * Records stream checkpoint and canonical chain_events.
   */
  async processEvents(
    events: Array<{ eventName: string; args: any; logIndex?: number; transactionHash?: string }>,
    fallbackTxHash?: string,
    contractAddress?: `0x${string}`,
    blockNumber?: bigint,
    blockHash?: `0x${string}`
  ) {
    let entitlementsCreated = 0;
    let digitalKeysIssued = 0;

    const registeredAddress = (this.rewardContractAddress !== "0x0000000000000000000000000000000000000000"
      ? this.rewardContractAddress
      : process.env.REWARD_CONTRACT_ADDRESS) as `0x${string}` | undefined;

    if (registeredAddress && contractAddress && contractAddress.toLowerCase() !== registeredAddress.toLowerCase()) {
      this.logger.warn(`processEvents rejected events from unauthorized contract address: ${contractAddress}`);
      return { entitlementsCreated: 0, digitalKeysIssued: 0 };
    }

    const bNum = blockNumber ?? 1n;
    const bHash = blockHash ?? ("0x" + "0".repeat(64));
    const activeAddress = (contractAddress || this.rewardContractAddress).toLowerCase();
    const streamId = `REWARD:${this.chainId}:${activeAddress}`;

    // Maintain indexerStreams checkpoint
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

    const findCampaign = async (onchainId: string) => {
      const q = this.db.select().from(rewardCampaigns)
        .where(eq(rewardCampaigns.onchainCampaignId, onchainId));
      const [camp] = typeof (q as any)?.orderBy === "function"
        ? await (q as any).orderBy(sql`${rewardCampaigns.createdAt} DESC`).limit(1)
        : await q;
      return camp;
    };

    for (const event of events) {
      const txHash = event.transactionHash || fallbackTxHash || "0x" + "0".repeat(64);
      const logIdx = event.logIndex ?? 0;

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

      // Record canonical event in chain_events
      await this.db.insert(schema.chainEvents).values({
        streamId,
        transactionHash: txHash,
        logIndex: logIdx,
        blockHash: bHash,
        blockNumber: bNum.toString(),
        eventName: event.eventName,
        args: serializeBigInts(event.args),
        canonical: true,
      }).onConflictDoNothing();

      switch (event.eventName) {
        case "CampaignCreated": {
          const { campaignId, creator, commitmentHash, goal } = event.args;
          const onchainId = campaignId.toString();

          const [existing] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.commitmentHash, commitmentHash));

          if (existing) {
            await this.db.update(rewardCampaigns).set({
              onchainCampaignId: onchainId,
              status: "PUBLISHED",
              updatedAt: new Date(),
            }).where(eq(rewardCampaigns.id, existing.id));

            await this.updateProjection(streamId, onchainId, existing.id, "PUBLISHED", event.eventName, txHash, bNum);
            this.logger.log(`Linked on-chain campaign #${onchainId} to DB campaign ${existing.id}`);
          }
          break;
        }

        case "RewardPledged": {
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

          const [tier] = await this.db.select().from(rewardTiers)
            .where(and(eq(rewardTiers.campaignId, campaign.id), eq(rewardTiers.tierIndex, tierIndex)));
          if (!tier) {
            this.logger.warn(`Tier #${tierIndex} for campaign ${campaign.id} not found`);
            continue;
          }

          // Find or create backer user
          let [walletLink] = await this.db.select().from(walletLinks)
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
            const [insertedRow] = await tx.insert(rewardEntitlements).values({
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
            }).onConflictDoNothing({ target: [rewardEntitlements.txHash, rewardEntitlements.logIndex] }).returning();

            if (insertedRow) {
              await tx.update(rewardTiers)
                .set({ pledgedQuantity: sql`${rewardTiers.pledgedQuantity} + ${pledgeQty}` })
                .where(eq(rewardTiers.id, tier.id));
            }
            return insertedRow;
          });

          if (inserted) {
            entitlementsCreated++;
            this.logger.log(`Indexed RewardPledged: backer ${backerWallet}, tier ${tierIndex}, qty ${pledgeQty}`);
            await this.updateProjection(streamId, onchainId, campaign.id, campaign.status, event.eventName, txHash, bNum);
          }
          break;
        }

        case "CampaignActivated": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();
          const campaign = await findCampaign(onchainId);
          if (campaign) {
            await this.db.update(rewardCampaigns).set({
              status: "ACTIVE",
              updatedAt: new Date(),
            }).where(eq(rewardCampaigns.id, campaign.id));
            await this.updateProjection(streamId, onchainId, campaign.id, "ACTIVE", event.eventName, txHash, bNum);
          }
          break;
        }

        case "ProductionVerified": {
          const { campaignId, reportHash } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(rewardCampaigns).set({
            status: "PRODUCTION_VERIFIED",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.id, campaign.id));

          // GATED ACTIVATION: Issue digital access codes now that production is verified
          const digitalEntitlements = await this.db.select({
            entitlementId: rewardEntitlements.id,
            isDigital: rewardTiers.isDigital,
          })
          .from(rewardEntitlements)
          .innerJoin(rewardTiers, eq(rewardEntitlements.tierId, rewardTiers.id))
          .where(and(
            eq(rewardEntitlements.campaignId, campaign.id),
            eq(rewardTiers.isDigital, true),
            sql`${rewardEntitlements.digitalAccessCode} IS NULL`
          ));

          for (const item of digitalEntitlements) {
            const key = `COMIC-READ-${randomBytes(4).toString("hex").toUpperCase()}-${Date.now().toString().slice(-4)}`;
            await this.db.update(rewardEntitlements).set({
              digitalAccessCode: key,
              updatedAt: new Date(),
            }).where(eq(rewardEntitlements.id, item.entitlementId));
            digitalKeysIssued++;
          }

          await this.updateProjection(streamId, onchainId, campaign.id, "PRODUCTION_VERIFIED", event.eventName, txHash, bNum);
          this.logger.log(`Production verified for #${onchainId}: issued ${digitalKeysIssued} digital access keys.`);
          break;
        }

        case "FulfillmentComplete": {
          const { campaignId, fulfillmentReportHash } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(rewardCampaigns).set({
            status: "COMPLETED",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.id, campaign.id));

          await this.updateProjection(streamId, onchainId, campaign.id, "COMPLETED", event.eventName, txHash, bNum);
          this.logger.log(`Fulfillment complete verified for #${onchainId}`);
          break;
        }

        case "WindDownStarted": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(rewardCampaigns).set({
            status: "STOPPED",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.id, campaign.id));

          await this.db.update(rewardEntitlements).set({
            status: "REFUND_ELIGIBLE",
            updatedAt: new Date(),
          }).where(and(
            eq(rewardEntitlements.campaignId, campaign.id),
            sql`${rewardEntitlements.status} IN ('ACTIVE', 'REDEEM_REQUESTED')`
          ));

          await this.updateProjection(streamId, onchainId, campaign.id, "STOPPED", event.eventName, txHash, bNum);
          break;
        }

        case "RefundClaimed": {
          const { campaignId, backer } = event.args;
          const onchainId = campaignId.toString();
          const backerWallet = (backer as string).toLowerCase();

          const campaign = await findCampaign(onchainId);
          if (!campaign) continue;

          await this.db.update(rewardEntitlements).set({
            status: "REFUNDED",
            updatedAt: new Date(),
          }).where(and(
            eq(rewardEntitlements.campaignId, campaign.id),
            eq(rewardEntitlements.backerWallet, backerWallet)
          ));

          await this.updateProjection(streamId, onchainId, campaign.id, "STOPPED", event.eventName, txHash, bNum);
          break;
        }
      }
    }

    return { entitlementsCreated, digitalKeysIssued };
  }

  private async updateProjection(
    streamId: string,
    onchainCampaignId: string,
    campaignId: string,
    status: string,
    lastEvent: string,
    lastTxHash: string,
    blockNumber: bigint
  ) {
    try {
      await this.db.insert(rewardCampaignProjection).values({
        streamId,
        onchainCampaignId,
        campaignMetadataId: campaignId,
        snapshot: {
          onchainCampaignId,
          status,
          lastEvent,
          lastTxHash,
          blockNumber: blockNumber.toString(),
          updatedAt: new Date().toISOString(),
        },
      }).onConflictDoUpdate({
        target: [rewardCampaignProjection.streamId, rewardCampaignProjection.onchainCampaignId],
        set: {
          snapshot: {
            onchainCampaignId,
            status,
            lastEvent,
            lastTxHash,
            blockNumber: blockNumber.toString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update campaign projection: ${err.message}`);
    }
  }
}
