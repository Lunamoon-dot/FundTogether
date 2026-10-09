import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Address } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, campaignMilestoneDrafts, advanceCampaignPlans, organizationMembers, organizations, walletLinks } from "../database/schema";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { giftDraftSchema, giftUpdateSchema, goalUnits } from "./advance-campaign.schema";
import type { GiftDraft, GiftUpdate } from "./advance-campaign.schema";
import { freezeGiftPlan, restoreGiftPlan } from "./advance-plan";
import type { AdvanceSubmissionPlan } from "./advance.types";

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

@Injectable()
export class AdvanceCampaignService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly chain: AdvanceBlockchainService) {}

  private async owner(tx: Tx, organizationId: string, userId: string, lock = true) {
    const query = tx.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId),
      eq(organizationMembers.role, "OWNER"),
    ));
    const [member] = lock ? await query.for("share") : await query.limit(1);
    if (!member) throw new ForbiddenException("Organization OWNER membership required");
  }

  private contextCondition() {
    return and(eq(advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
      eq(advanceCampaignPlans.chainId, this.chain.context.chainId),
      eq(advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase()));
  }

  private async aggregate(tx: Tx, id: string, userId: string, lock = false) {
    const query = tx.select({ campaign: campaignMetadata, plan: advanceCampaignPlans })
      .from(campaignMetadata).innerJoin(advanceCampaignPlans, eq(advanceCampaignPlans.campaignMetadataId, campaignMetadata.id))
      .where(and(eq(campaignMetadata.id, id), ne(campaignMetadata.status, "deleted"), this.contextCondition()));
    const [row] = lock ? await query.for("update", { of: campaignMetadata }) : await query.limit(1);
    if (!row?.campaign.organizationId) throw new NotFoundException("Workflow B campaign not found");
    await this.owner(tx, row.campaign.organizationId, userId, lock);
    const milestones = await tx.select().from(campaignMilestoneDrafts)
      .where(eq(campaignMilestoneDrafts.campaignMetadataId, id)).orderBy(asc(campaignMilestoneDrafts.milestoneIndex));
    const content = { ...row.plan.giftConfig, title: row.campaign.title,
      description: row.campaign.description!, fundingDuration: row.plan.fundingDuration,
      stages: milestones.map((m, i) => ({ ...row.plan.giftConfig.stages[i], id: m.id, title: m.title,
        description: m.description!, budgetUnits: m.budgetUnits!, acceptanceCriteria: row.plan.giftConfig.stages[i].acceptanceCriteria })) };
    return { ...row, content, milestones };
  }

  private savedPlan(row: typeof advanceCampaignPlans.$inferSelect): AdvanceSubmissionPlan | null {
    if (!row.frozenAt) return null;
    return restoreGiftPlan(row, this.chain.deployment);
  }

  async list(organizationId: string, userId: string) {
    return this.db.transaction(async tx => {
      await this.owner(tx, organizationId, userId);
      return tx.select({ id: campaignMetadata.id, title: campaignMetadata.title, revision: campaignMetadata.revision,
        status: campaignMetadata.status, createdAt: campaignMetadata.createdAt, frozenAt: advanceCampaignPlans.frozenAt })
        .from(campaignMetadata).innerJoin(advanceCampaignPlans, eq(advanceCampaignPlans.campaignMetadataId, campaignMetadata.id))
        .where(and(eq(campaignMetadata.organizationId, organizationId), ne(campaignMetadata.status, "deleted"), this.contextCondition()))
        .orderBy(desc(campaignMetadata.createdAt), desc(campaignMetadata.id));
    });
  }

  async get(id: string, userId: string) {
    return this.db.transaction(async tx => {
      const row = await this.aggregate(tx, id, userId);
      return { ...row.campaign, content: row.content, goalUnits: goalUnits(row.content), frozen: Boolean(row.plan.frozenAt),
        submissionPlan: this.savedPlan(row.plan) };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async create(organizationId: string, userId: string, input: GiftDraft) {
    const content = giftDraftSchema.parse(input);
    return this.db.transaction(async tx => {
      await this.owner(tx, organizationId, userId);
      const [campaign] = await tx.insert(campaignMetadata).values({ organizationId, createdByUserId: userId,
        title: content.title, description: content.description }).returning();
      const milestones = await tx.insert(campaignMilestoneDrafts).values(content.stages.map((s, milestoneIndex) => ({
        campaignMetadataId: campaign.id, milestoneIndex, title: s.title, description: s.description,
        budgetUnits: s.budgetUnits, acceptanceCriteria: s.acceptanceCriteria.map(c => ({ criterionId: c.criterionId, description: c.description })),
      }))).returning();
      await tx.insert(advanceCampaignPlans).values({ campaignMetadataId: campaign.id,
        deploymentId: this.chain.context.deploymentId, chainId: this.chain.context.chainId,
        contractAddress: this.chain.context.contractAddress.toLowerCase(), giftConfig: content, fundingDuration: content.fundingDuration });
      return { ...campaign, content: { ...content, stages: content.stages.map((s, i) => ({ ...s,
        id: milestones.find(m => m.milestoneIndex === i)!.id })) }, goalUnits: goalUnits(content), frozen: false, submissionPlan: null };
    });
  }

  async update(id: string, userId: string, input: GiftUpdate) {
    const parsed = giftUpdateSchema.parse(input);
    return this.db.transaction(async tx => {
      const row = await this.aggregate(tx, id, userId, true);
      if (row.plan.frozenAt || row.campaign.status !== "draft" || row.campaign.revision !== parsed.expectedRevision)
        throw new ConflictException("Campaign is frozen or changed; reload before saving");
      const ids = new Set(row.milestones.map(m => m.id));
      if (parsed.stages.some(s => s.id && !ids.has(s.id))) throw new BadRequestException("Milestone ID does not belong to this campaign");
      // Evidence cannot exist before freeze on B, but preserve foreign-key safety if imported data exists.
      const [evidence] = await tx.select({ id: schema.evidenceDrafts.id }).from(schema.evidenceDrafts)
        .where(eq(schema.evidenceDrafts.campaignMetadataId, id)).limit(1);
      if (evidence) throw new ConflictException("Campaign already has evidence");
      const { expectedRevision: _expected, ...content } = parsed;
      await tx.delete(campaignMilestoneDrafts).where(eq(campaignMilestoneDrafts.campaignMetadataId, id));
      const milestones = await tx.insert(campaignMilestoneDrafts).values(content.stages.map((s, milestoneIndex) => ({
        id: s.id, campaignMetadataId: id, milestoneIndex, title: s.title, description: s.description,
        budgetUnits: s.budgetUnits, acceptanceCriteria: s.acceptanceCriteria.map(c => ({ criterionId: c.criterionId, description: c.description })),
      }))).returning();
      await tx.update(advanceCampaignPlans).set({ giftConfig: content, fundingDuration: content.fundingDuration })
        .where(eq(advanceCampaignPlans.campaignMetadataId, id));
      const [campaign] = await tx.update(campaignMetadata).set({ title: content.title, description: content.description,
        revision: parsed.expectedRevision + 1, updatedAt: new Date() }).where(eq(campaignMetadata.id, id)).returning();
      return { ...campaign, content: { ...content, stages: content.stages.map((s, i) => ({ ...s,
        id: milestones.find(m => m.milestoneIndex === i)!.id })) }, goalUnits: goalUnits(content), frozen: false, submissionPlan: null };
    });
  }

  async prepareSubmission(id: string, userId: string, revision: number) {
    await this.chain.verifyDeployment();
    return this.db.transaction(async tx => {
      const row = await this.aggregate(tx, id, userId, true);
      if (row.campaign.revision !== revision) throw new ConflictException("Campaign revision changed; reload before freezing");
      const existing = this.savedPlan(row.plan);
      if (existing) return existing;
      if (row.campaign.status !== "draft" || row.campaign.onchainCampaignId) throw new ConflictException("Campaign cannot be frozen");
      const [wallet] = await tx.select({ address: walletLinks.address, chainId: walletLinks.chainId, userId: walletLinks.userId })
        .from(organizations).innerJoin(walletLinks, eq(organizations.representativeWalletLinkId, walletLinks.id))
        .where(eq(organizations.id, row.campaign.organizationId!)).for("share");
      if (!wallet || wallet.userId !== userId || Number(wallet.chainId) !== this.chain.context.chainId
        || wallet.address.toLowerCase() === this.chain.context.resolver.toLowerCase())
        throw new ForbiddenException("Linked organization representative wallet on31338 required; resolver cannot organize");
      const plan = freezeGiftPlan(id, revision, wallet.address as Address, row.content, this.chain.deployment);
      await this.chain.verifyDeployment();
      await tx.update(advanceCampaignPlans).set({ organizerWallet: plan.organizer, draftKey: plan.draftKey,
        frozenPlanBytes: plan.planBytes, planHash: plan.planHash, frozenAt: new Date() })
        .where(eq(advanceCampaignPlans.campaignMetadataId, id));
      await tx.update(campaignMetadata).set({ status: "submission_prepared", updatedAt: new Date() })
        .where(eq(campaignMetadata.id, id));
      return plan;
    });
  }
}
