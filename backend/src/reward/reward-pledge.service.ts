import { Inject, Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  rewardCampaigns,
  rewardDisputes,
  rewardEntitlements,
  rewardTiers,
  users,
} from "../database/schema";
import type {
  ClaimRewardRefundInput,
  NotifyRewardPledgeInput,
  OpenRewardDisputeInput,
  ResolveRewardDisputeInput,
} from "./reward-pledge.schema";
import { RewardIndexerService } from "./reward-indexer.service";


@Injectable()
export class RewardPledgeService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly indexerService: RewardIndexerService
  ) {}

  /**
   * Flow V3/Pledge: Verified on-chain pledge recording via Indexer.
   * Client provides txHash -> Server verifies receipt and canonical events.
   * Does NOT trust client-submitted parameters blindly!
   */
  async notifyPledge(userId: string, input: NotifyRewardPledgeInput) {
    const txHash = input.txHash as `0x${string}`;

    // Process on-chain receipt through indexer
    const result = await this.indexerService.processReceipt(txHash);

    // Query the canonical indexed entitlement
    const [entitlement] = await this.db.select().from(rewardEntitlements)
      .where(eq(rewardEntitlements.txHash, txHash));

    if (!entitlement) {
      throw new BadRequestException("No valid RewardPledged event found in transaction receipt");
    }

    const [tier] = await this.db.select().from(rewardTiers).where(eq(rewardTiers.id, entitlement.tierId));
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, entitlement.campaignId));

    return { entitlement, tier, campaign };
  }

  async listMyEntitlements(userId: string) {
    const entitlements = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.backerUserId, userId));
    return Promise.all(entitlements.map(async e => {
      const [tier] = await this.db.select().from(rewardTiers).where(eq(rewardTiers.id, e.tierId));
      const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, e.campaignId));
      const projections = await this.db.select().from(schema.rewardCampaignProjection)
        .where(eq(schema.rewardCampaignProjection.campaignMetadataId, e.campaignId));
      const projection = projections.length === 1 ? projections[0] : null;
      return {
        ...e,
        tier,
        campaignTitle: campaign?.title || "Unknown Campaign",
        campaignStatus: campaign?.status || "UNKNOWN",
        onchainCampaignId: projection?.onchainCampaignId || null,
        contractAddress: projection?.streamId.match(/^REWARD:31339:(0x[0-9a-fA-F]{40})$/)?.[1] || null,
      };
    }));
  }

  async resolveDispute(resolverUserId: string, disputeId: string, input: ResolveRewardDisputeInput) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to resolve reward disputes");
    }

    const [dispute] = await this.db.select().from(rewardDisputes).where(eq(rewardDisputes.id, disputeId));
    if (!dispute) throw new NotFoundException("Dispute not found");
    if (dispute.status !== "OPEN") throw new ConflictException("Dispute has already been resolved");

    return this.db.transaction(async tx => {
      const [updatedDispute] = await tx.update(rewardDisputes).set({
        status: input.outcome,
        resolutionNote: input.resolutionNote,
        resolvedBy: resolverUserId,
        resolvedAt: new Date(),
      }).where(eq(rewardDisputes.id, disputeId)).returning();

      // Historical off-chain decision only: this does not create an on-chain refund right.
      let nextEntitlementStatus = "DELIVERED";
      if (input.outcome === "RESOLVED_BACKER") {
        nextEntitlementStatus = "REFUND_ELIGIBLE";
      } else if (input.outcome === "RESOLVED_CREATOR" || input.outcome === "DISMISSED") {
        nextEntitlementStatus = "CONFIRMED";
      }

      await tx.update(rewardEntitlements).set({
        status: nextEntitlementStatus,
        updatedAt: new Date(),
      }).where(eq(rewardEntitlements.id, dispute.entitlementId));

      return updatedDispute;
    });
  }

  async listDisputesForResolver() {
    return this.db.select().from(rewardDisputes);
  }


  async openDispute(userId: string, entitlementId: string, input: OpenRewardDisputeInput) {
    const [entitlement] = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.id, entitlementId));
    if (!entitlement) throw new NotFoundException("Reward entitlement not found");
    if (entitlement.backerUserId !== userId) throw new ForbiddenException("Only backer can open dispute");

    return this.db.transaction(async tx => {
      const [dispute] = await tx.insert(rewardDisputes).values({
        entitlementId,
        backerUserId: userId,
        reason: input.reason,
        evidenceHash: input.evidenceHash,
        status: "OPEN",
      }).returning();

      await tx.update(rewardEntitlements).set({
        status: "DISPUTED",
        updatedAt: new Date(),
      }).where(eq(rewardEntitlements.id, entitlementId));

      return dispute;
    });
  }

  /**
   * Verified on-chain refund claim indexing:
   * Backer submits txHash of `claimRefund` -> Indexer verifies receipt and `RefundClaimed` event
   * from registered Reward contract -> updates backer's entitlements to `REFUNDED`.
   */
  async claimRefund(userId: string, input: ClaimRewardRefundInput) {
    const txHash = input.txHash as `0x${string}`;
    try {
      await this.indexerService.processReceipt(txHash);
    } catch (err: any) {
      throw new BadRequestException(`Failed to verify and index RefundClaimed receipt: ${err.message}`);
    }

    const refundedEntitlements = await this.db.select().from(rewardEntitlements).where(
      and(
        eq(rewardEntitlements.backerUserId, userId),
        eq(rewardEntitlements.status, "REFUNDED")
      )
    );

    if (refundedEntitlements.length === 0) {
      throw new BadRequestException("No valid RefundClaimed event found for this backer in transaction receipt");
    }

    return {
      synced: true,
      txHash,
      refundedEntitlements,
    };
  }
}

