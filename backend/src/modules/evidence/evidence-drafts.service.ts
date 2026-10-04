import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../database/database.constants";
import { evidenceDrafts } from "../../database/schema/evidence-drafts.schema";
import { campaignMetadata } from "../../database/schema/campaigns.schema";
import { campaignMilestoneDrafts } from "../../database/schema/campaign-milestones.schema";
import * as schema from "../../database/schema";
import { campaignAccessCondition, EvidenceAccessService } from "./evidence-access.service";
import { EvidenceDraftContent } from "./evidence.schema";

const EVIDENCE_SCHEMA_VERSION = "0.1";

function evidenceCampaignAccessCondition(userId: string) {
  return sql<boolean>`exists (
    select 1 from ${campaignMetadata}
    where ${campaignMetadata.id} = ${evidenceDrafts.campaignMetadataId}
      and ${campaignAccessCondition(userId)}
  )`;
}

@Injectable()
export class EvidenceDraftsService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
    private readonly evidenceAccess: EvidenceAccessService,
  ) {}

  async create(
    campaignId: string,
    milestoneIndex: string,
    organizerUserId: string,
    content: EvidenceDraftContent,
    milestoneId: string,
  ) {
    if (content.documents.length) {
      throw new BadRequestException("Documents must be attached through the upload API");
    }
    await this.evidenceAccess.assertCampaignOrganizer(
      campaignId,
      organizerUserId,
    );

    try {
      return await this.database.transaction(async (transaction) => {
        // Serialize evidence creation with campaign planning edits.
        const [campaign] = await transaction
          .select({ id: campaignMetadata.id })
          .from(campaignMetadata)
          .where(
            and(
              eq(campaignMetadata.id, campaignId),
              campaignAccessCondition(organizerUserId),
            ),
          )
          .for("update");
        if (!campaign) throw new NotFoundException("Campaign not found");
        const index = Number(milestoneIndex);
        if (!Number.isSafeInteger(index) || index > 2147483647) {
          throw new BadRequestException("Milestone index is outside the supported range");
        }
        const [milestone] = await transaction
          .select({ id: campaignMilestoneDrafts.id })
          .from(campaignMilestoneDrafts)
          .where(and(
            eq(campaignMilestoneDrafts.campaignMetadataId, campaignId),
            eq(campaignMilestoneDrafts.milestoneIndex, index),
          ))
          .limit(1);
        if (!milestone) throw new NotFoundException("Milestone not found");
        if (milestone.id !== milestoneId) {
          throw new ConflictException({
            code: "MILESTONE_CHANGED",
            message: "Milestone changed; reload the campaign before creating evidence",
          });
        }
        const [draft] = await transaction
          .insert(evidenceDrafts)
          .values({
            campaignMetadataId: campaignId,
            milestoneIndex,
            organizerUserId,
            evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
            content,
            revision: 1,
          })
          .returning();
        return draft;
      });
    } catch (error) {
      const databaseError = error as { code?: string; cause?: { code?: string } };
      if ((databaseError.code ?? databaseError.cause?.code) === "23505") {
        throw new ConflictException(
          "An evidence draft already exists for this milestone",
        );
      }
      throw error;
    }
  }

  async update(
    campaignId: string,
    milestoneIndex: string,
    organizerUserId: string,
    expectedRevision: number,
    content: EvidenceDraftContent,
  ) {
    await this.evidenceAccess.assertCampaignOrganizer(
      campaignId,
      organizerUserId,
    );

    const [draft] = await this.database
      .update(evidenceDrafts)
      .set({ content, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(evidenceDrafts.campaignMetadataId, campaignId),
          eq(evidenceDrafts.milestoneIndex, milestoneIndex),
          eq(evidenceDrafts.revision, expectedRevision),
          sql`(
            select coalesce(jsonb_agg(document - 'relatesToExpenseIds' - 'relatesToCriterionIds'
              order by document->>'documentId'), '[]'::jsonb)
            from jsonb_array_elements(${evidenceDrafts.content}->'documents') document
          ) = ${JSON.stringify(content.documents.map(({ relatesToExpenseIds, relatesToCriterionIds, ...immutable }) => immutable)
            .sort((left, right) => left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0))}::jsonb`,
          evidenceCampaignAccessCondition(organizerUserId),
        ),
      )
      .returning();

    if (!draft) {
      throw new ConflictException(
        "Draft changed since it was read; fetch the latest revision before retrying",
      );
    }
    return draft;
  }

  async get(
    campaignId: string,
    milestoneIndex: string,
    organizerUserId: string,
  ) {
    await this.evidenceAccess.assertCampaignOrganizer(
      campaignId,
      organizerUserId,
    );

    const [draft] = await this.database
      .select()
      .from(evidenceDrafts)
      .where(
        and(
          eq(evidenceDrafts.campaignMetadataId, campaignId),
          eq(evidenceDrafts.milestoneIndex, milestoneIndex),
          evidenceCampaignAccessCondition(organizerUserId),
        ),
      )
      .limit(1);

    if (!draft) throw new NotFoundException("Evidence draft not found");
    return draft;
  }
}
