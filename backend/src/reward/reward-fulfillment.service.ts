import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  rewardBatchEntitlements,
  rewardCampaigns,
  rewardDisputes,
  rewardEntitlements,
  rewardFulfillmentBatches,
} from "../database/schema";
import type { CreateFulfillmentBatchInput, ResolveRewardDisputeInput } from "./reward-pledge.schema";

@Injectable()
export class RewardFulfillmentService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * Flow V4: Create physical fulfillment batch.
   * Gated: Requires PRODUCTION_VERIFIED status!
   */
  async createBatch(creatorId: string, campaignId: string, input: CreateFulfillmentBatchInput) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.creatorUserId !== creatorId) throw new ForbiddenException("Only campaign creator can dispatch fulfillment batches");

    // Enforce Production Verification requirement before physical dispatch
    if (campaign.status !== "PRODUCTION_VERIFIED") {
      throw new ConflictException("Physical fulfillment batches can only be dispatched after samples are verified (PRODUCTION_VERIFIED)");
    }

    const entitlementIds = Object.keys(input.trackingCodes);
    if (entitlementIds.length !== input.shippedItemCount) {
      throw new BadRequestException("shippedItemCount must strictly match number of tracking codes provided");
    }

    return this.db.transaction(async tx => {
      const [batch] = await tx.insert(rewardFulfillmentBatches).values({
        campaignId,
        batchNumber: input.batchNumber,
        title: input.title,
        carrier: input.carrier,
        manifestHash: input.manifestHash,
        shippedItemCount: input.shippedItemCount,
      }).returning();

      for (const [entitlementId, trackingCode] of Object.entries(input.trackingCodes)) {
        const [entitlement] = await tx.select().from(rewardEntitlements)
          .where(and(eq(rewardEntitlements.id, entitlementId), eq(rewardEntitlements.campaignId, campaignId)));
        if (!entitlement) throw new NotFoundException(`Entitlement ${entitlementId} not found in this campaign`);

        // Record in batch-entitlement join table
        await tx.insert(rewardBatchEntitlements).values({
          batchId: batch.id,
          entitlementId,
          carrierTrackingCode: trackingCode,
        });

        // Update entitlement state to FULFILLING
        await tx.update(rewardEntitlements).set({
          carrierTrackingCode: trackingCode,
          status: "FULFILLING",
          updatedAt: new Date(),
        }).where(eq(rewardEntitlements.id, entitlementId));
      }

      return batch;
    });
  }

  /**
   * Mark entitlement as delivered by postal carrier
   */
  async markDelivered(entitlementId: string) {
    const [entitlement] = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.id, entitlementId));
    if (!entitlement) throw new NotFoundException("Entitlement not found");

    const [updated] = await this.db.update(rewardEntitlements).set({
      status: "DELIVERED",
      deliveredAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(rewardEntitlements.id, entitlementId)).returning();

    return updated;
  }

  /**
   * Flow V4: Resolver resolution of backer dispute
   */
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

      // If resolved in favor of backer (lost/damaged package), unlock REFUND_ELIGIBLE
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

  async listBatches(campaignId: string) {
    return this.db.select().from(rewardFulfillmentBatches)
      .where(eq(rewardFulfillmentBatches.campaignId, campaignId));
  }

  async listEntitlementsToFulfill(creatorId: string, campaignId: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.creatorUserId !== creatorId) throw new ForbiddenException("Only creator can list fulfillment list");

    return this.db.select().from(rewardEntitlements).where(
      and(
        eq(rewardEntitlements.campaignId, campaignId),
        inArray(rewardEntitlements.status, ["ACTIVE", "REDEEM_REQUESTED", "FULFILLING"])
      )
    );
  }

  /**
   * Flow V4: Resolver attests that physical fulfillment / reward delivery is complete.
   * Gated: Requires PRODUCTION_VERIFIED status!
   */
  async attestFulfillmentComplete(resolverUserId: string, campaignId: string, fulfillmentReportHash: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to attest fulfillment completion");
    }

    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.status !== "PRODUCTION_VERIFIED") {
      throw new ConflictException("Campaign must be in PRODUCTION_VERIFIED status to attest fulfillment complete");
    }

    const [updated] = await this.db.update(rewardCampaigns).set({
      status: "FULFILLMENT_COMPLETE",
      updatedAt: new Date(),
    }).where(eq(rewardCampaigns.id, campaignId)).returning();

    return updated;
  }
}
