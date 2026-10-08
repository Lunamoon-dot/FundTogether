import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../database/database.constants";
import { campaignMetadata } from "../../database/schema/campaigns.schema";
import { campaignMilestoneDrafts } from "../../database/schema/campaign-milestones.schema";
import type {
  CreateCampaignDraftInput,
  UpdateCampaignDraftInput,
} from "./campaign-draft.schema";
import { evidenceDrafts } from "../../database/schema/evidence-drafts.schema";
import * as schema from "../../database/schema";
import { campaignAccessCondition, EvidenceAccessService } from "../evidence/evidence-access.service";
import { organizationMembers } from "../../database/schema/organizations.schema";
import { campaignSubmissions } from "../../database/schema/campaign-submissions.schema";
import { campaignChainProjection } from "../../database/schema/indexer.schema";
import { campaignReviews, campaignRevisions } from "../../database/schema/campaign-reviews.schema";
import { evidencePackages } from "../../database/schema/evidence-packages.schema";

// A saved submission may already have a wallet transaction, even before indexing.
function deletableDraftCondition() {
  return and(
    eq(campaignMetadata.status, "draft"),
    isNull(campaignMetadata.chainId),
    isNull(campaignMetadata.contractAddress),
    isNull(campaignMetadata.onchainCampaignId),
    sql<boolean>`not exists (select 1 from ${campaignSubmissions} where ${campaignSubmissions.campaignMetadataId} = ${campaignMetadata.id})`,
    sql<boolean>`not exists (select 1 from ${campaignChainProjection} where ${campaignChainProjection.metadataId} = ${campaignMetadata.id})`,
    sql<boolean>`not exists (select 1 from ${campaignReviews} where ${campaignReviews.campaignMetadataId} = ${campaignMetadata.id})`,
    sql<boolean>`not exists (select 1 from ${campaignRevisions} where ${campaignRevisions.parentId} = ${campaignMetadata.id} or ${campaignRevisions.childId} = ${campaignMetadata.id})`,
    sql<boolean>`not exists (select 1 from ${evidencePackages} where ${evidencePackages.campaignMetadataId} = ${campaignMetadata.id})`,
  )!;
}

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
    private readonly evidenceAccess: EvidenceAccessService,
  ) {}

  async listDrafts(organizerUserId: string, organizationId?: string) {
    if (organizationId) {
      const [membership] = await this.database.select({ userId: organizationMembers.userId })
        .from(organizationMembers).where(and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, organizerUserId),
          eq(organizationMembers.role, "OWNER"),
        )).limit(1);
      if (!membership) throw new ForbiddenException("Organization OWNER membership required");
    }
    return this.database
      .select({
        id: campaignMetadata.id,
        organizationId: campaignMetadata.organizationId,
        createdByUserId: campaignMetadata.createdByUserId,
        title: campaignMetadata.title,
        description: campaignMetadata.description,
        status: campaignMetadata.status,
        createdAt: campaignMetadata.createdAt,
        revision: campaignMetadata.revision,
        canDelete: deletableDraftCondition(),
      })
      .from(campaignMetadata)
      .where(
        and(
          campaignAccessCondition(organizerUserId),
          organizationId ? eq(campaignMetadata.organizationId, organizationId) : isNull(campaignMetadata.organizationId),
        ),
      )
      .orderBy(desc(campaignMetadata.createdAt), desc(campaignMetadata.id));
  }

  async createDraft(organizerUserId: string, input: CreateCampaignDraftInput, organizationId?: string) {
    return this.database.transaction(async (transaction) => {
      if (organizationId) {
        const [membership] = await transaction.select({ userId: organizationMembers.userId })
          .from(organizationMembers).where(and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, organizerUserId),
            eq(organizationMembers.role, "OWNER"),
          )).for("share");
        if (!membership) throw new ForbiddenException("Organization OWNER membership required");
      }
      const [campaign] = await transaction
        .insert(campaignMetadata)
        .values({
          organizerUserId: organizationId ? null : organizerUserId,
          organizationId: organizationId ?? null,
          createdByUserId: organizerUserId,
          title: input.title,
          description: input.description,
        })
        .returning({
          id: campaignMetadata.id,
          organizationId: campaignMetadata.organizationId,
          createdByUserId: campaignMetadata.createdByUserId,
          title: campaignMetadata.title,
          description: campaignMetadata.description,
          status: campaignMetadata.status,
          createdAt: campaignMetadata.createdAt,
          updatedAt: campaignMetadata.updatedAt,
          revision: campaignMetadata.revision,
          canDelete: deletableDraftCondition(),
        });

      const milestones = await transaction
        .insert(campaignMilestoneDrafts)
        .values(
          input.milestones.map((milestone, milestoneIndex) => ({
            campaignMetadataId: campaign.id,
            milestoneIndex,
            title: milestone.title,
            description: milestone.description,
            budgetUnits: milestone.budgetUnits,
            acceptanceCriteria: milestone.acceptanceCriteria,
          })),
        )
        .returning({
          id: campaignMilestoneDrafts.id,
          milestoneIndex: campaignMilestoneDrafts.milestoneIndex,
          title: campaignMilestoneDrafts.title,
          description: campaignMilestoneDrafts.description,
          budgetUnits: campaignMilestoneDrafts.budgetUnits,
          acceptanceCriteria: campaignMilestoneDrafts.acceptanceCriteria,
        });
      return {
        ...campaign,
        milestones: milestones.sort(
          (a, b) => a.milestoneIndex - b.milestoneIndex,
        ),
      };
    });
  }

  async updateDraft(
    campaignId: string,
    organizerUserId: string,
    input: UpdateCampaignDraftInput,
  ) {
    await this.evidenceAccess.assertCampaignOrganizer(
      campaignId,
      organizerUserId,
    );
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      // This conditional update locks the aggregate and detects stale writers.
      const [campaign] = await transaction
        .update(campaignMetadata)
        .set({
          title: input.title,
          description: input.description,
          revision: sql`${campaignMetadata.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(campaignMetadata.id, campaignId),
            campaignAccessCondition(organizerUserId),
            eq(campaignMetadata.status, "draft"),
            eq(campaignMetadata.revision, input.expectedRevision),
            isNull(campaignMetadata.chainId),
            isNull(campaignMetadata.contractAddress),
            isNull(campaignMetadata.onchainCampaignId),
          ),
        )
        .returning({
          id: campaignMetadata.id,
          organizationId: campaignMetadata.organizationId,
          createdByUserId: campaignMetadata.createdByUserId,
          title: campaignMetadata.title,
          description: campaignMetadata.description,
          status: campaignMetadata.status,
          revision: campaignMetadata.revision,
          createdAt: campaignMetadata.createdAt,
          updatedAt: campaignMetadata.updatedAt,
          canDelete: deletableDraftCondition(),
        });
      if (!campaign)
        throw new ConflictException({
          code: "CAMPAIGN_NOT_EDITABLE_OR_STALE",
          message:
            "Campaign changed or is no longer an editable private draft. Read the latest version before saving.",
        });

      const [evidence] = await transaction
        .select({ id: evidenceDrafts.id })
        .from(evidenceDrafts)
        .where(eq(evidenceDrafts.campaignMetadataId, campaignId))
        .limit(1);
      if (evidence)
        throw new ConflictException({
          code: "CAMPAIGN_HAS_EVIDENCE",
          message:
            "Campaign already has evidence. Milestone references must be reconciled before editing its plan.",
        });
      const existing = await transaction
        .select()
        .from(campaignMilestoneDrafts)
        .where(eq(campaignMilestoneDrafts.campaignMetadataId, campaignId));
      const existingById = new Map(
        existing.map((milestone) => [milestone.id, milestone]),
      );
      if (
        input.milestones.some(
          (milestone) => milestone.id && !existingById.has(milestone.id),
        )
      ) {
        throw new BadRequestException(
          "Milestone ID does not belong to this campaign",
        );
      }
      // Replace the ordered draft list, preserving retained IDs and creation dates.
      await transaction
        .delete(campaignMilestoneDrafts)
        .where(eq(campaignMilestoneDrafts.campaignMetadataId, campaignId));
      const milestones = await transaction
        .insert(campaignMilestoneDrafts)
        .values(
          input.milestones.map((milestone, milestoneIndex) => ({
            id: milestone.id,
            campaignMetadataId: campaignId,
            milestoneIndex,
            title: milestone.title,
            description: milestone.description,
            budgetUnits: milestone.budgetUnits,
            acceptanceCriteria: milestone.acceptanceCriteria,
            createdAt: milestone.id
              ? existingById.get(milestone.id)!.createdAt
              : now,
            updatedAt: now,
          })),
        )
        .returning({
          id: campaignMilestoneDrafts.id,
          milestoneIndex: campaignMilestoneDrafts.milestoneIndex,
          title: campaignMilestoneDrafts.title,
          description: campaignMilestoneDrafts.description,
          budgetUnits: campaignMilestoneDrafts.budgetUnits,
          acceptanceCriteria: campaignMilestoneDrafts.acceptanceCriteria,
        });
      return {
        ...campaign,
        milestones: milestones.sort(
          (a, b) => a.milestoneIndex - b.milestoneIndex,
        ),
      };
    });
  }

  async deleteDraft(campaignId: string, organizerUserId: string, expectedRevision: number) {
    await this.evidenceAccess.assertCampaignOrganizer(campaignId, organizerUserId);
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction.select({ organizationId: campaignMetadata.organizationId })
        .from(campaignMetadata).where(and(
          eq(campaignMetadata.id, campaignId), campaignAccessCondition(organizerUserId),
        )).for("update");
      if (!current) throw new NotFoundException("Campaign not found");
      if (current.organizationId) {
        const [membership] = await transaction.select({ userId: organizationMembers.userId })
          .from(organizationMembers).where(and(
            eq(organizationMembers.organizationId, current.organizationId),
            eq(organizationMembers.userId, organizerUserId),
            eq(organizationMembers.role, "OWNER"),
          )).for("share");
        if (!membership) throw new ForbiddenException("Organization OWNER membership required");
      }
      const [deleted] = await transaction.update(campaignMetadata).set({
        status: "deleted",
        revision: sql`${campaignMetadata.revision} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(campaignMetadata.id, campaignId),
        campaignAccessCondition(organizerUserId),
        eq(campaignMetadata.revision, expectedRevision),
        deletableDraftCondition(),
      )).returning({ id: campaignMetadata.id, status: campaignMetadata.status });
      if (!deleted) throw new ConflictException({
        code: "CAMPAIGN_NOT_DELETABLE_OR_STALE",
        message: "Bản nháp đã thay đổi hoặc đã chốt nộp. Tải lại danh sách trước khi xóa; hồ sơ nộp và lịch sử blockchain phải được giữ lại.",
      });
      return deleted;
    });
  }

  async getDraft(campaignId: string, organizerUserId: string) {
    await this.evidenceAccess.assertCampaignOrganizer(
      campaignId,
      organizerUserId,
    );

    return this.database.transaction(
      async (transaction) => {
        const [campaign] = await transaction
          .select({
            id: campaignMetadata.id,
            organizationId: campaignMetadata.organizationId,
            createdByUserId: campaignMetadata.createdByUserId,
            title: campaignMetadata.title,
            description: campaignMetadata.description,
            status: campaignMetadata.status,
            createdAt: campaignMetadata.createdAt,
            updatedAt: campaignMetadata.updatedAt,
            revision: campaignMetadata.revision,
            canDelete: deletableDraftCondition(),
          })
          .from(campaignMetadata)
          .where(
            and(
              eq(campaignMetadata.id, campaignId),
              campaignAccessCondition(organizerUserId),
            ),
          )
          .limit(1);

        if (!campaign) throw new NotFoundException("Campaign not found");
        const milestones = await transaction
          .select({
            id: campaignMilestoneDrafts.id,
            milestoneIndex: campaignMilestoneDrafts.milestoneIndex,
            title: campaignMilestoneDrafts.title,
            description: campaignMilestoneDrafts.description,
            budgetUnits: campaignMilestoneDrafts.budgetUnits,
            acceptanceCriteria: campaignMilestoneDrafts.acceptanceCriteria,
          })
          .from(campaignMilestoneDrafts)
          .where(eq(campaignMilestoneDrafts.campaignMetadataId, campaignId))
          .orderBy(asc(campaignMilestoneDrafts.milestoneIndex));
        return { ...campaign, milestones };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
