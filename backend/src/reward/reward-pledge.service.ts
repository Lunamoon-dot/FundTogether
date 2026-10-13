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
  UpdateShippingAddressInput,
} from "./reward-pledge.schema";
import { RewardCryptoService } from "./reward-crypto.service";
import { RewardIndexerService } from "./reward-indexer.service";


@Injectable()
export class RewardPledgeService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly cryptoService: RewardCryptoService,
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

  /**
   * Secure Shipping PII Update: AES-256-GCM encrypted off-chain storage
   */
  async updateShipping(userId: string, entitlementId: string, input: UpdateShippingAddressInput) {
    const [entitlement] = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.id, entitlementId));
    if (!entitlement) throw new NotFoundException("Reward entitlement not found");
    if (entitlement.backerUserId !== userId) throw new ForbiddenException("Only entitlement owner can update shipping info");

    // Encrypt sensitive PII using AES-256-GCM
    const encryptedResult = this.cryptoService.encryptShipping({
      fullName: input.fullName,
      address: input.address,
      phone: input.phone,
    });

    const [updated] = await this.db.update(rewardEntitlements).set({
      shippingEncrypted: encryptedResult.encrypted,
      shippingIv: encryptedResult.iv,
      shippingTag: encryptedResult.tag,
      shippingUpdatedAt: new Date(),
      // Mask plaintext columns for security
      shippingFullName: "*** Protected ***",
      shippingAddress: "*** Encrypted (AES-256-GCM) ***",
      shippingPhone: "*** Protected ***",
      status: entitlement.status === "ACTIVE" ? "REDEEM_REQUESTED" : entitlement.status,
      updatedAt: new Date(),
    }).where(eq(rewardEntitlements.id, entitlementId)).returning();

    return updated;
  }

  /**
   * Controlled ACL PII Decryption: accessible ONLY by backer or campaign creator
   */
  async getDecryptedShipping(requesterUserId: string, entitlementId: string) {
    const [entitlement] = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.id, entitlementId));
    if (!entitlement) throw new NotFoundException("Reward entitlement not found");

    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, entitlement.campaignId));
    if (!campaign) throw new NotFoundException("Campaign not found");

    const isBacker = entitlement.backerUserId === requesterUserId;
    const isCreator = campaign.creatorUserId === requesterUserId;

    if (!isBacker && !isCreator) {
      throw new ForbiddenException("Access denied: Shipping PII is strictly protected by ACL");
    }

    if (!entitlement.shippingEncrypted || !entitlement.shippingIv || !entitlement.shippingTag) {
      return null;
    }

    return this.cryptoService.decryptShipping(
      entitlement.shippingEncrypted,
      entitlement.shippingIv,
      entitlement.shippingTag
    );
  }

  async listMyEntitlements(userId: string) {
    const entitlements = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.backerUserId, userId));
    return Promise.all(entitlements.map(async e => {
      const [tier] = await this.db.select().from(rewardTiers).where(eq(rewardTiers.id, e.tierId));
      const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, e.campaignId));
      return {
        ...e,
        tier,
        campaignTitle: campaign?.title || "Unknown Campaign",
        campaignStatus: campaign?.status || "UNKNOWN",
        onchainCampaignId: campaign?.onchainCampaignId?.toString() || null,
      };
    }));
  }

  async confirmDelivery(userId: string, entitlementId: string) {
    const [entitlement] = await this.db.select().from(rewardEntitlements).where(eq(rewardEntitlements.id, entitlementId));
    if (!entitlement) throw new NotFoundException("Reward entitlement not found");
    if (entitlement.backerUserId !== userId) throw new ForbiddenException("Only backer can confirm delivery");
    if (entitlement.status !== "DELIVERED" && entitlement.status !== "FULFILLING") {
      throw new ConflictException("Entitlement must be in delivery before confirming receipt");
    }

    const [updated] = await this.db.update(rewardEntitlements).set({
      status: "CONFIRMED",
      confirmedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(rewardEntitlements.id, entitlementId)).returning();

    return updated;
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

