import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, hedCampaignDrafts, organizationMembers } from "../database/schema";
import type { HedCampaignDraftInput } from "./hed-campaign-draft.schema";

export const hedCommitmentHash = (content: HedCampaignDraftInput) => keccak256(toHex(JSON.stringify({
  version: "hed-mvp-1", purpose: content.purpose, beneficiaryScope: content.beneficiaryScope,
  allowedExpenseCategories: content.allowedExpenseCategories, outcomeCriteria: content.outcomeCriteria,
  goal: content.goal, fundingDuration: content.fundingDuration, policyHash: content.policyHash,
})));

@Injectable()
export class HedCampaignDraftService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  private async owner(organizationId: string, userId: string) {
    const [membership] = await this.db.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER"),
    )).limit(1);
    if (!membership) throw new ForbiddenException("Organization OWNER membership required");
  }

  async create(organizationId: string, userId: string, input: HedCampaignDraftInput) {
    await this.owner(organizationId, userId);
    return this.db.transaction(async tx => {
      const [campaign] = await tx.insert(campaignMetadata).values({ organizationId, createdByUserId: userId,
        title: input.title, description: input.description, status: "hed_draft" }).returning();
      const [draft] = await tx.insert(hedCampaignDrafts).values({ campaignMetadataId: campaign.id, content: input,
        goal: input.goal, fundingDuration: input.fundingDuration }).returning();
      return { id: campaign.id, organizationId, title: campaign.title, description: campaign.description, content: draft.content,
        goal: draft.goal, fundingDuration: draft.fundingDuration, commitmentHash: draft.commitmentHash, frozenAt: draft.frozenAt };
    });
  }

  async list(organizationId: string, userId: string) {
    await this.owner(organizationId, userId);
    return this.db.select({ id: campaignMetadata.id, title: campaignMetadata.title, description: campaignMetadata.description,
      content: hedCampaignDrafts.content, goal: hedCampaignDrafts.goal, fundingDuration: hedCampaignDrafts.fundingDuration,
      commitmentHash: hedCampaignDrafts.commitmentHash, frozenAt: hedCampaignDrafts.frozenAt, createdAt: hedCampaignDrafts.createdAt })
      .from(hedCampaignDrafts).innerJoin(campaignMetadata, eq(campaignMetadata.id, hedCampaignDrafts.campaignMetadataId))
      .where(and(eq(campaignMetadata.organizationId, organizationId), eq(campaignMetadata.createdByUserId, userId))).orderBy(desc(hedCampaignDrafts.createdAt));
  }

  async freeze(campaignId: string, userId: string) {
    const [current] = await this.db.select({ organizationId: campaignMetadata.organizationId, content: hedCampaignDrafts.content,
      frozenAt: hedCampaignDrafts.frozenAt }).from(hedCampaignDrafts).innerJoin(campaignMetadata, eq(campaignMetadata.id, hedCampaignDrafts.campaignMetadataId))
      .where(eq(campaignMetadata.id, campaignId)).limit(1);
    if (!current) throw new NotFoundException("HED campaign draft not found");
    if (!current.organizationId) throw new ForbiddenException("HED campaign requires an organization");
    await this.owner(current.organizationId, userId);
    if (current.frozenAt) throw new ConflictException("HED campaign draft is already frozen");
    const commitmentHash = hedCommitmentHash(current.content);
    const [draft] = await this.db.update(hedCampaignDrafts).set({ commitmentHash, frozenAt: new Date() })
      .where(and(eq(hedCampaignDrafts.campaignMetadataId, campaignId), isNull(hedCampaignDrafts.frozenAt))).returning();
    if (!draft) throw new ConflictException("HED campaign draft changed; reload before freezing");
    return { campaignId, commitmentHash: draft.commitmentHash, frozenAt: draft.frozenAt };
  }
}
