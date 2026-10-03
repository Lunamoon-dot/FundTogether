import {
  BadRequestException,
  ConflictException,
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
import { EvidenceAccessService } from "../evidence/evidence-access.service";

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
    private readonly evidenceAccess: EvidenceAccessService,
  ) {}

  async listDrafts(organizerUserId: string) {
    return this.database
      .select({
        id: campaignMetadata.id,
        title: campaignMetadata.title,
        description: campaignMetadata.description,
        status: campaignMetadata.status,
        createdAt: campaignMetadata.createdAt,
      })
      .from(campaignMetadata)
      .where(
        and(
          eq(campaignMetadata.organizerUserId, organizerUserId),
          eq(campaignMetadata.status, "draft"),
        ),
      )
      .orderBy(desc(campaignMetadata.createdAt), desc(campaignMetadata.id));
  }

  async createDraft(organizerUserId: string, input: CreateCampaignDraftInput) {
    return this.database.transaction(async (transaction) => {
      const [campaign] = await transaction
        .insert(campaignMetadata)
        .values({
          organizerUserId,
          title: input.title,
          description: input.description,
        })
        .returning({
          id: campaignMetadata.id,
          title: campaignMetadata.title,
          description: campaignMetadata.description,
          status: campaignMetadata.status,
          createdAt: campaignMetadata.createdAt,
          updatedAt: campaignMetadata.updatedAt,
          revision: campaignMetadata.revision,
        });

      const milestones = await transaction
        .insert(campaignMilestoneDrafts)
        .values(
          input.milestones.map((milestone, milestoneIndex) => ({
            campaignMetadataId: campaign.id,
            milestoneIndex,
            title: milestone.title,
            description: milestone.description,
            acceptanceCriteria: milestone.acceptanceCriteria,
          })),
        )
        .returning({
          id: campaignMilestoneDrafts.id,
          milestoneIndex: campaignMilestoneDrafts.milestoneIndex,
          title: campaignMilestoneDrafts.title,
          description: campaignMilestoneDrafts.description,
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
            eq(campaignMetadata.organizerUserId, organizerUserId),
            eq(campaignMetadata.status, "draft"),
            eq(campaignMetadata.revision, input.expectedRevision),
            isNull(campaignMetadata.chainId),
            isNull(campaignMetadata.contractAddress),
            isNull(campaignMetadata.onchainCampaignId),
          ),
        )
        .returning({
          id: campaignMetadata.id,
          title: campaignMetadata.title,
          description: campaignMetadata.description,
          status: campaignMetadata.status,
          revision: campaignMetadata.revision,
          createdAt: campaignMetadata.createdAt,
          updatedAt: campaignMetadata.updatedAt,
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
            title: campaignMetadata.title,
            description: campaignMetadata.description,
            status: campaignMetadata.status,
            createdAt: campaignMetadata.createdAt,
            updatedAt: campaignMetadata.updatedAt,
            revision: campaignMetadata.revision,
          })
          .from(campaignMetadata)
          .where(
            and(
              eq(campaignMetadata.id, campaignId),
              eq(campaignMetadata.organizerUserId, organizerUserId),
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
