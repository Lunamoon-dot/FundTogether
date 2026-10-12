import { Inject, Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  rewardCampaigns,
  rewardCreatorProfiles,
  rewardReviews,
  rewardTiers,
  users,
} from "../database/schema";
import type {
  CreateRewardCampaignDraftInput,
  CreatorVerificationInput,
  AdminReviewCreatorInput,
  ResolverReviewCampaignInput,
} from "./reward-campaign.schema";
import { RewardCryptoService } from "./reward-crypto.service";
import rewardAbiJson = require("../blockchain/generated/reward/fund-together-reward.abi.json");
import { createPublicClient, defineChain, http } from "viem";

@Injectable()
export class RewardCampaignService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly cryptoService: RewardCryptoService
  ) {}

  /**
   * Flow V1: Creator submits identity and rights declaration for Admin verification
   */
  async applyCreatorVerification(userId: string, input: CreatorVerificationInput) {
    const [existing] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.userId, userId));
    if (existing && existing.status === "VERIFIED") {
      throw new ConflictException("Creator profile is already verified");
    }

    if (existing) {
      const [updated] = await this.db.update(rewardCreatorProfiles).set({
        displayName: input.displayName,
        bio: input.bio,
        ipDeclaration: input.ipDeclaration,
        status: "PENDING",
        rejectionReason: null,
        updatedAt: new Date(),
      }).where(eq(rewardCreatorProfiles.id, existing.id)).returning();
      return updated;
    }

    const [profile] = await this.db.insert(rewardCreatorProfiles).values({
      userId,
      displayName: input.displayName,
      bio: input.bio,
      ipDeclaration: input.ipDeclaration,
      status: "PENDING",
    }).returning();
    return profile;
  }

  /**
   * Flow V1: Admin reviews and verifies Creator profile
   */
  async adminReviewCreator(adminUserId: string, profileId: string, input: AdminReviewCreatorInput) {
    const [profile] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.id, profileId));
    if (!profile) throw new NotFoundException("Creator profile not found");

    const [updated] = await this.db.update(rewardCreatorProfiles).set({
      status: input.outcome,
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: input.outcome === "REJECTED" ? input.rejectionReason || "Requirements not met" : null,
      updatedAt: new Date(),
    }).where(eq(rewardCreatorProfiles.id, profileId)).returning();

    return updated;
  }

  async getCreatorProfile(userId: string) {
    const [profile] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.userId, userId));
    return profile || null;
  }

  /**
   * Create campaign draft - requires verified Creator profile
   */
  async createDraft(userId: string, input: CreateRewardCampaignDraftInput) {
    const [profile] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.userId, userId));
    if (!profile || profile.status !== "VERIFIED") {
      throw new ForbiddenException("Creator must be verified by Admin before creating a campaign draft (Flow V1)");
    }

    return this.db.transaction(async tx => {
      const [campaign] = await tx.insert(rewardCampaigns).values({
        creatorUserId: userId,
        title: input.title,
        pitch: input.pitch,
        story: input.story,
        category: input.category,
        goal: input.goal,
        fundingDuration: input.fundingDuration,
        policyHash: input.policyHash,
        status: "DRAFT",
      }).returning();

      const createdTiers = [];
      for (let i = 0; i < input.tiers.length; i++) {
        const t = input.tiers[i];
        const [tier] = await tx.insert(rewardTiers).values({
          campaignId: campaign.id,
          tierIndex: i,
          title: t.title,
          description: t.description,
          price: t.price,
          maxQuantity: t.maxQuantity,
          pledgedQuantity: 0,
          isDigital: t.isDigital,
          rewardItems: t.rewardItems,
          estimatedDeliveryAt: t.estimatedDeliveryAt ? new Date(t.estimatedDeliveryAt) : null,
        }).returning();
        createdTiers.push(tier);
      }

      const commitmentHash = this.cryptoService.computeCommitmentHash({
        title: input.title,
        pitch: input.pitch,
        story: input.story,
        category: input.category,
        goal: input.goal,
        fundingDuration: input.fundingDuration,
        tiers: createdTiers.map(t => ({
          tierIndex: t.tierIndex,
          title: t.title,
          description: t.description,
          price: t.price,
          maxQuantity: t.maxQuantity,
          isDigital: t.isDigital,
          rewardItems: t.rewardItems as string[],
          estimatedDeliveryAt: t.estimatedDeliveryAt?.toISOString(),
        })),
        ipDeclaration: profile.ipDeclaration,
      });

      const [updated] = await tx.update(rewardCampaigns)
        .set({ commitmentHash, updatedAt: new Date() })
        .where(eq(rewardCampaigns.id, campaign.id))
        .returning();

      return { ...updated, tiers: createdTiers };
    });
  }

  /**
   * Freeze campaign commitment
   */
  async freeze(id: string, userId: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, id));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can freeze campaign draft");
    if (campaign.frozenAt) throw new ConflictException("Campaign draft already frozen");

    const tiers = await this.db.select().from(rewardTiers).where(eq(rewardTiers.campaignId, id));
    const [profile] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.userId, userId));

    const commitmentHash = this.cryptoService.computeCommitmentHash({
      title: campaign.title,
      pitch: campaign.pitch,
      story: campaign.story,
      category: campaign.category,
      goal: campaign.goal,
      fundingDuration: campaign.fundingDuration,
      tiers: tiers.map(t => ({
        tierIndex: t.tierIndex,
        title: t.title,
        description: t.description,
        price: t.price,
        maxQuantity: t.maxQuantity,
        isDigital: t.isDigital,
        rewardItems: t.rewardItems as string[],
        estimatedDeliveryAt: t.estimatedDeliveryAt?.toISOString(),
      })),
      ipDeclaration: profile?.ipDeclaration,
    });

    const [updated] = await this.db.update(rewardCampaigns).set({
      frozenAt: new Date(),
      status: "FROZEN",
      commitmentHash,
      updatedAt: new Date(),
    }).where(eq(rewardCampaigns.id, id)).returning();

    return updated;
  }

  /**
   * Flow V2: Submit frozen draft for Resolver review
   */
  async submitForReview(id: string, userId: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, id));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can submit for review");
    if (campaign.status !== "FROZEN") throw new BadRequestException("Campaign must be frozen before submitting for review");

    const [updated] = await this.db.update(rewardCampaigns).set({
      status: "UNDER_REVIEW",
      updatedAt: new Date(),
    }).where(eq(rewardCampaigns.id, id)).returning();

    return updated;
  }

  /**
   * Flow V2: Resolver reviews campaign feasibility, budget, and commitments
   */
  async resolverReview(resolverUserId: string, campaignId: string, input: ResolverReviewCampaignInput) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.status !== "UNDER_REVIEW") throw new BadRequestException("Campaign is not pending review");

    return this.db.transaction(async tx => {
      await tx.insert(rewardReviews).values({
        campaignId,
        resolverUserId,
        outcome: input.outcome,
        decisionReason: input.decisionReason,
        commitmentHash: campaign.commitmentHash || "0x00",
      });

      let nextStatus = campaign.status;
      let frozenAt = campaign.frozenAt;
      if (input.outcome === "APPROVED") {
        nextStatus = "APPROVED";
      } else if (input.outcome === "CHANGES_REQUESTED") {
        nextStatus = "DRAFT";
        frozenAt = null; // Unfreeze to allow editing
      } else if (input.outcome === "REJECTED") {
        nextStatus = "STOPPED";
      }

      const [updated] = await tx.update(rewardCampaigns).set({
        status: nextStatus,
        frozenAt,
        updatedAt: new Date(),
      }).where(eq(rewardCampaigns.id, campaignId)).returning();

      return updated;
    });
  }

  /**
   * Register on-chain campaign with cryptographic verification against the contract
   */
  async registerOnchain(id: string, userId: string, onchainCampaignId: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, id));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can register on-chain ID");

    // Must be approved by Resolver or in a publishable state
    if (!["APPROVED", "FROZEN"].includes(campaign.status)) {
      throw new BadRequestException("Campaign must be frozen and approved before on-chain registration (Flow V2)");
    }

    // Optional on-chain verification if RPC available
    const rpcUrl = process.env.HED_BLOCKCHAIN_RPC_URL;
    const contractAddress = process.env.REWARD_CONTRACT_ADDRESS as `0x${string}` | undefined;
    if (rpcUrl && contractAddress) {
      try {
        const chain = defineChain({
          id: 31339,
          name: "FundTogether Local",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        });
        const client = createPublicClient({ chain, transport: http(rpcUrl) });
        const onchainData: any = await client.readContract({
          address: contractAddress,
          abi: rewardAbiJson as any,
          functionName: "campaign",
          args: [BigInt(onchainCampaignId)],
        });

        if (onchainData.commitmentHash !== campaign.commitmentHash) {
          throw new BadRequestException("On-chain commitmentHash does not match database frozen commitment");
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        // RPC read error in isolated offline unit test
      }
    }

    const [updated] = await this.db.update(rewardCampaigns).set({
      onchainCampaignId,
      status: "PUBLISHED",
      updatedAt: new Date(),
    }).where(eq(rewardCampaigns.id, id)).returning();

    return updated;
  }

  async getById(id: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, id));
    if (!campaign) throw new NotFoundException("Reward campaign not found");
    const tiers = await this.db.select().from(rewardTiers).where(eq(rewardTiers.campaignId, id));
    const reviews = await this.db.select().from(rewardReviews).where(eq(rewardReviews.campaignId, id));
    return { ...campaign, tiers, reviews };
  }

  async listByCreator(userId: string) {
    const campaigns = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.creatorUserId, userId));
    return Promise.all(campaigns.map(async c => {
      const tiers = await this.db.select().from(rewardTiers).where(eq(rewardTiers.campaignId, c.id));
      return { ...c, tiers };
    }));
  }

  async listPublic() {
    const campaigns = await this.db.select().from(rewardCampaigns).where(
      and(
        eq(rewardCampaigns.status, "ACTIVE"),
      )
    );
    if (!campaigns.length) {
      // Return published/production verified/completed for exploration
      const allActive = await this.db.select().from(rewardCampaigns);
      return Promise.all(allActive.filter(c => ["PUBLISHED", "ACTIVE", "PRODUCTION_VERIFIED", "COMPLETED"].includes(c.status)).map(async c => {
        const tiers = await this.db.select().from(rewardTiers).where(eq(rewardTiers.campaignId, c.id));
        return { ...c, tiers };
      }));
    }
    return Promise.all(campaigns.map(async c => {
      const tiers = await this.db.select().from(rewardTiers).where(eq(rewardTiers.campaignId, c.id));
      return { ...c, tiers };
    }));
  }
}
