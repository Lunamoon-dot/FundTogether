import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../database/database.constants";
import { evidenceDrafts } from "../../database/schema/evidence-drafts.schema";
import { campaignMetadata } from "../../database/schema/campaigns.schema";
import * as schema from "../../database/schema";
import { EvidenceAccessService } from "./evidence-access.service";
import { EvidenceDraftContent } from "./evidence.schema";

const EVIDENCE_SCHEMA_VERSION = "0.1";

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
  ) {
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
              eq(campaignMetadata.organizerUserId, organizerUserId),
            ),
          )
          .for("update");
        if (!campaign) throw new NotFoundException("Campaign not found");
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
      if ((error as { code?: string }).code === "23505") {
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
        ),
      )
      .limit(1);

    if (!draft) throw new NotFoundException("Evidence draft not found");
    return draft;
  }
}
