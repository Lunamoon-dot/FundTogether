import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { DRIZZLE_DB } from "../../database/database.constants";
import { campaignMetadata } from "../../database/schema/campaigns.schema";
import * as schema from "../../database/schema";

@Injectable()
export class EvidenceAccessService {
  constructor(
    @Inject(DRIZZLE_DB)
    private readonly database: NodePgDatabase<typeof schema>,
  ) {}

  async assertCampaignOrganizer(
    campaignId: string,
    authenticatedUserId: string,
  ) {
    const [campaign] = await this.database
      .select({ organizerUserId: campaignMetadata.organizerUserId })
      .from(campaignMetadata)
      .where(eq(campaignMetadata.id, campaignId))
      .limit(1);

    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.organizerUserId !== authenticatedUserId) {
      throw new ForbiddenException(
        "Only the campaign organizer may manage evidence",
      );
    }
  }
}
