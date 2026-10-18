import { Inject, Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../../database/database.constants";
import * as schema from "../../../database/schema";
import {
  campaigns,
  historicalDisputes,
  historicalEntitlements,
  campaignTiers,
  users,
} from "../../../database/schema";
import type {
  ClaimRefundInput,
  NotifyPledgeInput,
  OpenDisputeInput,
  ResolveDisputeInput,
} from "../schemas/pledge.schema";
import { HistoricalCampaignIndexerService } from "../../../indexer/historical-campaign-indexer.service";

const HISTORICAL_DISPUTE_ELIGIBLE_STATUSES = new Set([
  "ACTIVE",
  "REDEEM_REQUESTED",
  "FULFILLING",
  "DELIVERED",
  "CONFIRMED",
]);

@Injectable()
export class PledgeService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly indexerService: HistoricalCampaignIndexerService
  ) {}

  /**
   * Flow V3/Pledge: Verified on-chain pledge recording via Indexer.
   * Client provides txHash -> Server verifies receipt and canonical events.
   * Does NOT trust client-submitted parameters blindly!
   */
  async notifyPledge(userId: string, input: NotifyPledgeInput) {
    const txHash = input.txHash as `0x${string}`;

    const result = await this.indexerService.processExpectedReceipt({
      txHash,
      campaignId: input.campaignId,
      action: "pledge",
      userId,
    });
    if (result.state !== "ON_CHAIN_CONFIRMED") {
      throw new BadRequestException(`Pledge receipt is not confirmed for this campaign (${result.state})`);
    }

    // Query the canonical indexed entitlement
    const [entitlement] = await this.db.select().from(historicalEntitlements)
      .where(and(
        eq(historicalEntitlements.txHash, txHash),
        eq(historicalEntitlements.campaignId, input.campaignId),
        eq(historicalEntitlements.backerUserId, userId),
      ));

    if (!entitlement) {
      throw new BadRequestException("No valid CampaignPledged event found for this backer in transaction receipt");
    }

    const [tier] = await this.db.select().from(campaignTiers).where(eq(campaignTiers.id, entitlement.tierId));
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, entitlement.campaignId));

    return { entitlement, tier, campaign };
  }

  async listMyEntitlements(userId: string) {
    const entitlements = await this.db.select().from(historicalEntitlements).where(eq(historicalEntitlements.backerUserId, userId));
    return Promise.all(entitlements.map(async e => {
      const [tier] = await this.db.select().from(campaignTiers).where(eq(campaignTiers.id, e.tierId));
      const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, e.campaignId));
      const projections = await this.db.select().from(schema.historicalCampaignProjection)
        .where(eq(schema.historicalCampaignProjection.campaignMetadataId, e.campaignId));
      const projection = projections.length === 1 ? projections[0] : null;
      return {
        ...e,
        tier,
        campaignTitle: campaign?.title || "Unknown Campaign",
        campaignStatus: campaign?.status || "UNKNOWN",
        onchainCampaignId: projection?.onchainCampaignId || null,
        contractAddress: projection?.streamId.match(/^CAMPAIGNS:31339:(0x[0-9a-fA-F]{40})$/)?.[1] || null,
      };
    }));
  }

  async resolveDispute(resolverUserId: string, disputeId: string, input: ResolveDisputeInput) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to resolve campaign disputes");
    }

    return this.db.transaction(async tx => {
      const [dispute] = await tx.select().from(historicalDisputes)
        .where(eq(historicalDisputes.id, disputeId)).for("update");
      if (!dispute) throw new NotFoundException("Dispute not found");
      if (dispute.status !== "OPEN") throw new ConflictException("Dispute has already been resolved");

      const [entitlement] = await tx.select({ status: historicalEntitlements.status })
        .from(historicalEntitlements)
        .where(eq(historicalEntitlements.id, dispute.entitlementId))
        .for("update");
      if (!entitlement) throw new NotFoundException("Campaign entitlement not found");
      if (entitlement.status !== "DISPUTED") {
        throw new ConflictException("Dispute cannot change the current entitlement state");
      }

      const [updatedDispute] = await tx.update(historicalDisputes).set({
        status: input.outcome,
        resolutionNote: input.resolutionNote,
        resolvedBy: resolverUserId,
        resolvedAt: new Date(),
      }).where(and(eq(historicalDisputes.id, disputeId), eq(historicalDisputes.status, "OPEN"))).returning();
      if (!updatedDispute) throw new ConflictException("Dispute has already been resolved");

      // Historical off-chain decision only: this does not create an on-chain refund right.
      let nextEntitlementStatus = "DELIVERED";
      if (input.outcome === "RESOLVED_BACKER") {
        nextEntitlementStatus = "REFUND_ELIGIBLE";
      } else if (input.outcome === "RESOLVED_CREATOR" || input.outcome === "DISMISSED") {
        nextEntitlementStatus = "CONFIRMED";
      }

      const [updatedEntitlement] = await tx.update(historicalEntitlements).set({
        status: nextEntitlementStatus,
        updatedAt: new Date(),
      }).where(and(
        eq(historicalEntitlements.id, dispute.entitlementId),
        eq(historicalEntitlements.status, "DISPUTED"),
      )).returning({ id: historicalEntitlements.id });
      if (!updatedEntitlement) throw new ConflictException("Dispute cannot change the current entitlement state");

      return updatedDispute;
    });
  }

  async listDisputesForResolver() {
    return this.db.select().from(historicalDisputes);
  }


  async openDispute(userId: string, entitlementId: string, input: OpenDisputeInput) {
    return this.db.transaction(async tx => {
      const [entitlement] = await tx.select({
        backerUserId: historicalEntitlements.backerUserId,
        status: historicalEntitlements.status,
      }).from(historicalEntitlements)
        .where(eq(historicalEntitlements.id, entitlementId)).for("update");
      if (!entitlement) throw new NotFoundException("Campaign entitlement not found");
      if (entitlement.backerUserId !== userId) throw new ForbiddenException("Only backer can open dispute");
      if (!HISTORICAL_DISPUTE_ELIGIBLE_STATUSES.has(entitlement.status)) {
        throw new ConflictException("This entitlement cannot open a dispute in its current state");
      }

      const [dispute] = await tx.insert(historicalDisputes).values({
        entitlementId,
        backerUserId: userId,
        reason: input.reason,
        evidenceHash: input.evidenceHash,
        status: "OPEN",
      }).onConflictDoNothing().returning();
      if (!dispute) throw new ConflictException("An open dispute already exists for this entitlement");

      const [updatedEntitlement] = await tx.update(historicalEntitlements).set({
        status: "DISPUTED",
        updatedAt: new Date(),
      }).where(and(
        eq(historicalEntitlements.id, entitlementId),
        eq(historicalEntitlements.status, entitlement.status),
      )).returning({ id: historicalEntitlements.id });
      if (!updatedEntitlement) throw new ConflictException("This entitlement changed before the dispute was opened");

      return dispute;
    });
  }

  /**
   * Verified on-chain refund claim indexing:
   * Backer submits txHash of `claimRefund` -> Indexer verifies receipt and `RefundClaimed` event
   * from registered FundTogether contract -> updates backer's entitlements to `REFUNDED`.
   */
  async claimRefund(userId: string, input: ClaimRefundInput) {
    const txHash = input.txHash as `0x${string}`;
    try {
      const result = await this.indexerService.processExpectedReceipt({
        txHash,
        campaignId: input.campaignId,
        action: "claimRefund",
        userId,
      });
      if (result.state !== "ON_CHAIN_CONFIRMED") {
        throw new BadRequestException(`Refund receipt is not confirmed for this campaign (${result.state})`);
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Failed to verify and index RefundClaimed receipt: ${err.message}`);
    }

    const refundedEntitlements = await this.db.select().from(historicalEntitlements).where(
      and(
        eq(historicalEntitlements.backerUserId, userId),
        eq(historicalEntitlements.campaignId, input.campaignId),
        eq(historicalEntitlements.status, "REFUNDED")
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

