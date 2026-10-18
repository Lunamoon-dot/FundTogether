import { Inject, Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Optional } from "@nestjs/common";
import { and, eq, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../../database/database.constants";
import * as schema from "../../../database/schema";
import {
  campaigns,
  creatorProfiles,
  campaignReviews,
  campaignTiers,
  historicalCampaignProjection,
  campaignChainCampaigns,
  users,
} from "../../../database/schema";
import type {
  CreateCampaignDraftInput,
  CreatorVerificationInput,
  AdminReviewCreatorInput,
  ResolverReviewCampaignInput,
} from "../schemas/campaign.schema";
import { createCampaignDraftSchema } from "../schemas/campaign.schema";
import { isCampaignKind, requireCurrentCampaign } from "../policies/campaign-kind.policy";
import { CommitmentService } from "./commitment.service";
import { HistoricalCampaignIndexerService, type HistoricalTransactionAction } from "../../../indexer/historical-campaign-indexer.service";
import { CampaignIndexerService } from "../../../indexer/campaign-indexer.service";
import historicalCampaignAbiJson = require("../../../blockchain/generated/fundtogether/fund-together-historical-campaign.abi.json");
import { createPublicClient, defineChain, http } from "viem";

@Injectable()
export class CampaignWorkflowService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly cryptoService: CommitmentService,
    private readonly indexerService: HistoricalCampaignIndexerService,
    @Optional() private readonly campaignIndexer?: CampaignIndexerService,
  ) {}

  private async validateStudioWallet(userId: string, walletLinkId: string) {
    const [wallet] = await this.db.select().from(schema.walletLinks).where(and(
      eq(schema.walletLinks.id, walletLinkId),
      eq(schema.walletLinks.userId, userId),
      eq(schema.walletLinks.chainId, "31339"),
    ));
    if (!wallet) throw new BadRequestException("Studio wallet must be a linked wallet on local chain 31339");
    if (this.campaignIndexer) {
      const deployment = await this.campaignIndexer.deployment();
      const resolverWallets = new Set([deployment.resolver, deployment.backupResolver].map(address => address.toLowerCase()));
      if (resolverWallets.has(wallet.address.toLowerCase())) {
        throw new BadRequestException("Studio wallet cannot be a Resolver wallet in the current Campaign deployment");
      }
    }
    return wallet;
  }

  private async getCampaignProjection(campaignId: string, onchainCampaignId: string | null, isCurrentCampaign: boolean) {
    if (isCurrentCampaign) {
      const [projection] = await this.db.select({ snapshot: campaignChainCampaigns.snapshot })
        .from(campaignChainCampaigns)
        .where(and(eq(campaignChainCampaigns.campaignId, campaignId), eq(campaignChainCampaigns.canonical, true)));
      return projection?.snapshot ?? null;
    }
    if (!onchainCampaignId) return null;
    const [projection] = await this.db.select({ snapshot: historicalCampaignProjection.snapshot })
      .from(historicalCampaignProjection)
      .where(eq(historicalCampaignProjection.campaignMetadataId, campaignId));
    return projection?.snapshot ?? null;
  }

  /**
   * Flow V1: Creator submits identity and rights declaration for Admin verification
   */
  async applyCreatorVerification(userId: string, input: CreatorVerificationInput) {
    await this.validateStudioWallet(userId, input.studioWalletLinkId);
    const [existing] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));
    if (existing && existing.status === "VERIFIED") {
      throw new ConflictException("Creator profile is already verified");
    }

    if (existing) {
      const [updated] = await this.db.update(creatorProfiles).set({
        displayName: input.displayName,
        bio: input.bio,
        ipDeclaration: input.ipDeclaration,
        primaryGenre: input.primaryGenre === undefined ? existing.primaryGenre : input.primaryGenre,
        portfolioUrl: input.portfolioUrl === undefined ? existing.portfolioUrl : input.portfolioUrl,
        socialUrl: input.socialUrl === undefined ? existing.socialUrl : input.socialUrl,
        contactEmail: input.contactEmail === undefined ? existing.contactEmail : input.contactEmail,
        originalWorkPledge: input.originalWorkPledge,
        studioWalletLinkId: input.studioWalletLinkId,
        status: "PENDING",
        rejectionReason: null,
        updatedAt: new Date(),
      }).where(eq(creatorProfiles.id, existing.id)).returning();
      return updated;
    }

    const [profile] = await this.db.insert(creatorProfiles).values({
      userId,
      displayName: input.displayName,
      bio: input.bio,
      ipDeclaration: input.ipDeclaration,
      primaryGenre: input.primaryGenre ?? null,
      portfolioUrl: input.portfolioUrl ?? null,
      socialUrl: input.socialUrl ?? null,
      contactEmail: input.contactEmail ?? null,
      originalWorkPledge: input.originalWorkPledge,
      studioWalletLinkId: input.studioWalletLinkId,
      status: "PENDING",
    }).returning();
    return profile;
  }

  async listCreatorProfilesForAdmin() {
    return this.db.select().from(creatorProfiles);
  }



  /**
   * Flow V1: Admin reviews and verifies Creator profile
   */
  async adminReviewCreator(adminUserId: string, profileId: string, input: AdminReviewCreatorInput) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, adminUserId)).limit(1);
    if (!role?.roles.includes("ADMIN")) {
      throw new ForbiddenException("ADMIN platform role required to review creator profiles");
    }

    const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.id, profileId));
    if (!profile) throw new NotFoundException("Creator profile not found");
    if (profile.userId === adminUserId) throw new ForbiddenException("Creator cannot verify their own profile");
    if (input.outcome === "VERIFIED" && profile.originalWorkPledge !== true) {
      throw new ConflictException("Explicit original-work pledge is required before creator verification");
    }
    if (input.outcome === "VERIFIED") {
      if (!profile.studioWalletLinkId) throw new ConflictException("A linked Studio wallet is required before verification");
      await this.validateStudioWallet(profile.userId, profile.studioWalletLinkId);
    }

    const [updated] = await this.db.update(creatorProfiles).set({
      status: input.outcome,
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: input.outcome === "REJECTED" ? input.rejectionReason || "Requirements not met" : null,
      updatedAt: new Date(),
    }).where(eq(creatorProfiles.id, profileId)).returning();

    return updated;
  }

  async getCreatorProfile(userId: string) {
    const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));
    return profile || null;
  }

  /**
   * Create campaign draft - requires verified Creator profile
   */
  async createDraft(userId: string, input: CreateCampaignDraftInput) {
    const parsed = createCampaignDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid Campaign draft", issues: parsed.error.issues });
    }
    const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));
    if (!profile || profile.status !== "VERIFIED") {
      throw new ForbiddenException("Creator must be verified by Admin before creating a campaign draft (Flow V1)");
    }
    if (!profile.studioWalletLinkId) {
      throw new ForbiddenException("Creator Studio must have a verified linked wallet before creating a campaign draft");
    }
    const config = parsed.data;
    const [campaign] = await this.db.insert(campaigns).values({
      creatorUserId: userId,
      title: config.title,
      pitch: config.pitch,
      story: config.story,
      category: config.category,
      goal: config.goal,
      fundingDuration: config.fundingDuration,
      draftConfig: config,
      status: "DRAFT",
    }).returning();
    return { ...campaign, tiers: [] };
  }

  /**
   * Freeze campaign commitment
   */
  async freeze(id: string, userId: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can freeze campaign draft");
    requireCurrentCampaign(campaign);
    if (campaign.frozenAt) throw new ConflictException("Campaign draft already frozen");

    const tiers = await this.db.select().from(campaignTiers).where(eq(campaignTiers.campaignId, id));
    const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));

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
        benefitItems: t.benefitItems as string[],
      })),
      ipDeclaration: profile?.ipDeclaration,
    });

    const [updated] = await this.db.update(campaigns).set({
      frozenAt: new Date(),
      status: "FROZEN",
      commitmentHash,
      updatedAt: new Date(),
    }).where(eq(campaigns.id, id)).returning();

    return updated;
  }

  /**
   * Flow V2: Submit frozen draft for Resolver review
   */
  async submitForReview(id: string, userId: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can submit for review");
    requireCurrentCampaign(campaign);
    if (campaign.status !== "FROZEN") throw new BadRequestException("Campaign must be frozen before submitting for review");

    const [updated] = await this.db.update(campaigns).set({
      status: "UNDER_REVIEW",
      updatedAt: new Date(),
    }).where(eq(campaigns.id, id)).returning();

    return updated;
  }

  /**
   * Flow V2: Resolver reviews campaign feasibility, budget, and commitments
   */
  async resolverReview(resolverUserId: string, campaignId: string, input: ResolverReviewCampaignInput) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to review campaigns");
    }

    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    requireCurrentCampaign(campaign);
    if (campaign.status !== "UNDER_REVIEW") throw new BadRequestException("Campaign is not pending review");

    return this.db.transaction(async tx => {
      await tx.insert(campaignReviews).values({
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

      const [updated] = await tx.update(campaigns).set({
        status: nextStatus,
        frozenAt,
        updatedAt: new Date(),
      }).where(eq(campaigns.id, campaignId)).returning();

      return updated;
    });
  }

  /**
   * Register on-chain campaign with mandatory cryptographic & deployment verification against the contract.
   * Fails closed if RPC URL or FUNDTOGETHER_CONTRACT_ADDRESS is not configured or has no deployed bytecode.
   */
  async registerOnchain(id: string, userId: string, onchainCampaignId: string, txHash?: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only creator can register on-chain ID");
    requireCurrentCampaign(campaign);

    // Must be approved by Resolver (Flow V2)
    if (campaign.status !== "APPROVED") {
      throw new BadRequestException("Campaign must be approved by Resolver before on-chain registration (Flow V2)");
    }

    const envRpc = process.env.FUNDTOGETHER_RPC_URL;
    const rpcUrl = envRpc !== undefined
      ? envRpc.trim()
      : this.indexerService.getRpcUrl();
    const contractAddress = this.indexerService.getContractAddress();

    if (!rpcUrl || !contractAddress) {
      throw new BadRequestException(
        "FundTogether contract deployment address and RPC URL must be configured before registering on-chain campaigns"
      );
    }

    try {
      const chain = defineChain({
        id: Number(process.env.CHAIN_ID) || 31339,
        name: "FundTogether Local",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      });
      const client = this.indexerService.getClient() ?? createPublicClient({ chain, transport: http(rpcUrl) });

      if (typeof (client as any).getCode === "function") {
        const bytecode = await client.getCode({ address: contractAddress });
        if (!bytecode || bytecode === "0x") {
          throw new BadRequestException("No deployed bytecode found at configured FundTogether contract address");
        }
      }

      const onchainData: any = await client.readContract({
        address: contractAddress,
        abi: historicalCampaignAbiJson as any,
        functionName: "campaign",
        args: [BigInt(onchainCampaignId)],
      });

      const onchainCommitment = onchainData.commitmentHash ?? onchainData[1];
      const onchainCreator = (onchainData.creator ?? onchainData[0] ?? "") as string;
      const onchainGoal = BigInt(onchainData.goal ?? onchainData[2] ?? 0);

      if (!onchainCommitment || onchainCommitment !== campaign.commitmentHash) {
        throw new BadRequestException("On-chain commitmentHash does not match database frozen commitment");
      }

      if (onchainGoal !== BigInt(campaign.goal)) {
        throw new BadRequestException("On-chain campaign goal does not match database frozen goal");
      }

      const [profile] = await this.db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId));
      if (!profile || profile.status !== "VERIFIED" || !profile.studioWalletLinkId) {
        throw new BadRequestException("A verified Creator profile with a Studio wallet is required");
      }
      const [studioWallet] = await this.db.select().from(schema.walletLinks).where(and(
        eq(schema.walletLinks.id, profile.studioWalletLinkId),
        eq(schema.walletLinks.userId, userId),
        eq(schema.walletLinks.chainId, "31339"),
      ));
      if (!studioWallet || studioWallet.address.toLowerCase() !== onchainCreator.toLowerCase()) {
        throw new BadRequestException("On-chain campaign creator must match the verified Studio wallet");
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Failed to verify campaign on-chain: ${err.message}`);
    }

    // Bind the requested metadata record before receipt synchronization so a
    // repeated commitmentHash cannot make CampaignCreated select an old draft.
    await this.db.transaction(async tx => {
      await tx.update(campaigns)
        .set({ onchainCampaignId: null })
        .where(and(eq(campaigns.onchainCampaignId, onchainCampaignId), ne(campaigns.id, id)));
      await tx.update(campaigns)
        .set({ onchainCampaignId, updatedAt: new Date() })
        .where(eq(campaigns.id, id));
    });

    if (!txHash) {
      await this.db.update(campaigns)
        .set({ onchainCampaignId: null, updatedAt: new Date() })
        .where(eq(campaigns.id, id));
      throw new BadRequestException("CampaignCreated transaction receipt is required for on-chain registration");
    }

    try {
      await this.indexerService.processReceipt(txHash as `0x${string}`);
      const [updated] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
      if (!updated || updated.status !== "PUBLISHED") {
        throw new Error("Receipt did not contain a CampaignCreated event for this campaign");
      }
      return updated;
    } catch (err: any) {
      await this.db.update(campaigns)
        .set({ onchainCampaignId: null, status: "APPROVED", updatedAt: new Date() })
        .where(eq(campaigns.id, id));
      throw new BadRequestException(`Failed to index CampaignCreated receipt: ${err.message}`);
    }
  }

  /**
   * Resolver activates a fully-funded campaign on-chain and indexes the canonical CampaignActivated receipt.
   */
  async activateCampaignOnchain(resolverUserId: string, campaignId: string, txHash: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to activate campaign");
    }

    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    requireCurrentCampaign(campaign);
    if (!campaign.onchainCampaignId) {
      throw new BadRequestException("Campaign is not registered on-chain");
    }

    try {
      await this.indexerService.processReceipt(txHash as `0x${string}`);
    } catch (err: any) {
      throw new BadRequestException(`Failed to verify and index activation receipt: ${err.message}`);
    }

    const [updated] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!updated || updated.status !== "ACTIVE") {
      throw new BadRequestException("Transaction receipt did not transition campaign to ACTIVE on-chain");
    }
    return updated;
  }

  /**
   * Flow V3: Resolver records production verification on-chain and indexes the canonical ProductionVerified receipt,
   * which triggers gated digital benefit issuance in HistoricalCampaignIndexerService.
   */
  async recordProductionVerifiedOnchain(resolverUserId: string, campaignId: string, txHash: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, resolverUserId)).limit(1);
    if (!role?.roles.includes("RESOLVER")) {
      throw new ForbiddenException("RESOLVER platform role required to verify production");
    }

    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    requireCurrentCampaign(campaign);
    if (!campaign.onchainCampaignId) {
      throw new BadRequestException("Campaign is not registered on-chain");
    }

    let syncResult: any;
    try {
      syncResult = await this.indexerService.processReceipt(txHash as `0x${string}`);
    } catch (err: any) {
      throw new BadRequestException(`Failed to verify and index production verification receipt: ${err.message}`);
    }

    const [updated] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!updated || updated.status !== "PRODUCTION_VERIFIED") {
      throw new BadRequestException("Transaction receipt did not transition campaign to PRODUCTION_VERIFIED on-chain");
    }
    return { ...updated, digitalKeysIssued: syncResult?.digitalKeysIssued ?? 0 };
  }

  /**
   * Flow V4 step 2: Creator or Resolver finalizes campaign completion on-chain after FULFILLMENT_COMPLETE
   * and indexes the canonical CampaignCompleted receipt.
   */
  async completeCampaignOnchain(userId: string, campaignId: string, txHash: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");

    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).limit(1);
    const isResolver = Boolean(role?.roles.includes("RESOLVER"));
    if (campaign.creatorUserId !== userId && !isResolver) {
      throw new ForbiddenException("Only the campaign creator or a Resolver can complete the campaign");
    }
    requireCurrentCampaign(campaign);
    if (!campaign.onchainCampaignId) {
      throw new BadRequestException("Campaign is not registered on-chain");
    }

    try {
      await this.indexerService.processReceipt(txHash as `0x${string}`);
    } catch (err: any) {
      throw new BadRequestException(`Failed to verify and index campaign completion receipt: ${err.message}`);
    }

    const [updated] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!updated || updated.status !== "COMPLETED") {
      throw new BadRequestException("Transaction receipt did not transition campaign to COMPLETED on-chain");
    }
    return updated;
  }

  /**
   * Unified receipt synchronization endpoint for any FundTogetherFundTogether contract transaction
   * (disbursement request, approval, expenditure candidate/settlement, wind-down, funding failure, dispute, etc.).
   */
  async syncReceipt(txHash: string, campaignId: string, action: HistoricalTransactionAction, userId: string) {
    try {
      return await this.indexerService.processExpectedReceipt({ txHash, campaignId, action, userId });
    } catch (err: any) {
      throw new BadRequestException(`Receipt synchronization failed: ${err.message}`);
    }
  }

  async getById(id: string, requesterUserId?: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    if (isCampaignKind(campaign)) {
      if (!requesterUserId) throw new NotFoundException("Campaign campaign not found");
      if (campaign.creatorUserId !== requesterUserId) throw new ForbiddenException("Only creator can read this Campaign draft");
    }
    const tiers = await this.db.select().from(campaignTiers).where(eq(campaignTiers.campaignId, id));
    const reviews = await this.db.select().from(campaignReviews).where(eq(campaignReviews.campaignId, id));
    const projection = await this.getCampaignProjection(id, campaign.onchainCampaignId, isCampaignKind(campaign));
    return { ...campaign, tiers, reviews, projection };
  }

  async listByCreator(userId: string) {
    const campaignRecords = await this.db.select().from(campaigns).where(eq(campaigns.creatorUserId, userId));
    return Promise.all(campaignRecords.map(async c => {
      const tiers = await this.db.select().from(campaignTiers).where(eq(campaignTiers.campaignId, c.id));
      const reviews = await this.db.select().from(campaignReviews).where(eq(campaignReviews.campaignId, c.id));
      const projection = await this.getCampaignProjection(c.id, c.onchainCampaignId, isCampaignKind(c));
      return { ...c, tiers, reviews, projection };
    }));
  }

  async listAllForResolver() {
    const campaignRecords = await this.db.select().from(campaigns);
    const submitted = campaignRecords.filter(c => !isCampaignKind(c) ||
      (c.frozenSnapshot && ["UNDER_REVIEW_PRIVATE", "COMMUNITY_REVIEW", "APPROVED", "PUBLISHED", "STOPPED"].includes(c.status)));
    return Promise.all(submitted.map(async c => {
      const tiers = await this.db.select().from(campaignTiers).where(eq(campaignTiers.campaignId, c.id));
      const reviews = await this.db.select().from(campaignReviews).where(eq(campaignReviews.campaignId, c.id));
      const projection = await this.getCampaignProjection(c.id, c.onchainCampaignId, isCampaignKind(c));
      return { ...c, tiers, reviews, projection };
    }));
  }

  async listPublic() {
    const allCampaigns = await this.db.select().from(campaigns);
    const publicStatuses = new Set([
      "PUBLISHED",
      "ACTIVE",
      "PRODUCTION_VERIFIED",
      "FULFILLMENT_COMPLETE",
      "COMPLETED",
      "STOPPED",
    ]);
    const visible = allCampaigns.filter(c => !isCampaignKind(c) && publicStatuses.has(c.status));
    return Promise.all(visible.map(async c => {
      const tiers = await this.db.select().from(campaignTiers).where(eq(campaignTiers.campaignId, c.id));
      const projection = await this.getCampaignProjection(c.id, c.onchainCampaignId, isCampaignKind(c));
      return { ...c, tiers, projection };
    }));
  }
}

