import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPublicClient, defineChain, http, parseEventLogs } from "viem";
import type { Log, PublicClient } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  rewardCampaigns,
  rewardEntitlements,
  rewardTiers,
  rewardCampaignProjection,
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

  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {
    const rpcUrl = process.env.HED_BLOCKCHAIN_RPC_URL || "http://127.0.0.1:9548";
    const chainId = Number(process.env.CHAIN_ID) || 31339;
    const chain = defineChain({
      id: chainId,
      name: "FundTogether Local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    this.client = createPublicClient({ chain, transport: http(rpcUrl) });
  }

  setContractAddress(address: `0x${string}`) {
    this.rewardContractAddress = address;
  }

  setClient(client: PublicClient) {
    this.client = client;
  }

  /**
   * Process a confirmed transaction receipt directly for instant, verified synchronization.
   * Eliminates unverified client-submitted data.
   */
  async processReceipt(txHash: `0x${string}`) {
    if (!this.client) throw new Error("Chain client not initialized");
    const receipt = await this.client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") {
      throw new Error(`Transaction ${txHash} reverted or not found on-chain`);
    }

    const parsedLogs = parseEventLogs({
      abi: rewardAbiJson as any,
      logs: receipt.logs,
      strict: false,
    });

    return this.processEvents(parsedLogs as any, txHash);
  }

  /**
   * Process decoded on-chain events and idempotently project state into PostgreSQL.
   */
  async processEvents(events: Array<{ eventName: string; args: any; logIndex?: number; transactionHash?: string }>, fallbackTxHash?: string) {
    let entitlementsCreated = 0;
    let digitalKeysIssued = 0;

    for (const event of events) {
      const txHash = event.transactionHash || fallbackTxHash || "0x" + "0".repeat(64);
      const logIdx = event.logIndex ?? 0;

      switch (event.eventName) {
        case "CampaignCreated": {
          const { campaignId, creator, commitmentHash, goal } = event.args;
          const onchainId = campaignId.toString();

          // Match by commitmentHash in DB
          const [existing] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.commitmentHash, commitmentHash));

          if (existing) {
            await this.db.update(rewardCampaigns).set({
              onchainCampaignId: onchainId,
              status: "PUBLISHED",
              updatedAt: new Date(),
            }).where(eq(rewardCampaigns.id, existing.id));
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

          // Idempotency check: (txHash, logIdx)
          const [duplicate] = await this.db.select().from(rewardEntitlements)
            .where(and(eq(rewardEntitlements.txHash, txHash), eq(rewardEntitlements.logIndex, logIdx)));

          if (duplicate) {
            this.logger.warn(`Skipping duplicate pledge event for tx ${txHash} at log ${logIdx}`);
            continue;
          }

          // Find campaign & tier
          const [campaign] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.onchainCampaignId, onchainId));
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
            .where(and(eq(walletLinks.address, backerWallet), eq(walletLinks.chainId, "31339")));
          let backerUserId: string;

          if (walletLink) {
            backerUserId = walletLink.userId;
          } else {
            const [newUser] = await this.db.insert(users).values({}).returning();
            await this.db.insert(walletLinks).values({
              userId: newUser.id,
              chainId: "31339",
              address: backerWallet,
              isPrimary: true,
            });
            backerUserId = newUser.id;
          }

          // Create entitlement in DB - DIGITAL KEY IS NOT ISSUED HERE!
          await this.db.transaction(async tx => {
            await tx.insert(rewardEntitlements).values({
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
            });

            await tx.update(rewardTiers)
              .set({ pledgedQuantity: sql`${rewardTiers.pledgedQuantity} + ${pledgeQty}` })
              .where(eq(rewardTiers.id, tier.id));
          });

          entitlementsCreated++;
          this.logger.log(`Indexed RewardPledged: backer ${backerWallet}, tier ${tierIndex}, qty ${pledgeQty}`);
          break;
        }

        case "CampaignActivated": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();
          await this.db.update(rewardCampaigns).set({
            status: "ACTIVE",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.onchainCampaignId, onchainId));
          break;
        }

        case "ProductionVerified": {
          const { campaignId, reportHash } = event.args;
          const onchainId = campaignId.toString();

          const [campaign] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.onchainCampaignId, onchainId));
          if (!campaign) continue;

          await this.db.update(rewardCampaigns).set({
            status: "PRODUCTION_VERIFIED",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.id, campaign.id));

          // GATED ACTIVATION: Issue digital access codes now that production is verified!
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

          this.logger.log(`Production verified for #${onchainId}: issued ${digitalKeysIssued} digital access keys.`);
          break;
        }

        case "WindDownStarted": {
          const { campaignId } = event.args;
          const onchainId = campaignId.toString();

          const [campaign] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.onchainCampaignId, onchainId));
          if (!campaign) continue;

          await this.db.update(rewardCampaigns).set({
            status: "STOPPED",
            updatedAt: new Date(),
          }).where(eq(rewardCampaigns.id, campaign.id));

          // All unfulfilled entitlements become REFUND_ELIGIBLE
          await this.db.update(rewardEntitlements).set({
            status: "REFUND_ELIGIBLE",
            updatedAt: new Date(),
          }).where(and(
            eq(rewardEntitlements.campaignId, campaign.id),
            sql`${rewardEntitlements.status} IN ('ACTIVE', 'REDEEM_REQUESTED')`
          ));
          break;
        }

        case "RefundClaimed": {
          const { campaignId, backer } = event.args;
          const onchainId = campaignId.toString();
          const backerWallet = (backer as string).toLowerCase();

          const [campaign] = await this.db.select().from(rewardCampaigns)
            .where(eq(rewardCampaigns.onchainCampaignId, onchainId));
          if (!campaign) continue;

          // Transition to REFUNDED to prevent double claim / duplicate delivery
          await this.db.update(rewardEntitlements).set({
            status: "REFUNDED",
            updatedAt: new Date(),
          }).where(and(
            eq(rewardEntitlements.campaignId, campaign.id),
            eq(rewardEntitlements.backerWallet, backerWallet)
          ));
          break;
        }
      }
    }

    return { entitlementsCreated, digitalKeysIssued };
  }
}
