import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { DRIZZLE_DB } from "../../database/database.constants";
import { campaignMetadata } from "../../database/schema/campaigns.schema";
import * as schema from "../../database/schema";
import { organizationMembers } from "../../database/schema/organizations.schema";

// Organization membership owns access; creator identity is audit data only.
export function campaignAccessCondition(userId: string) {
  return or(
    and(isNull(campaignMetadata.organizationId), eq(campaignMetadata.organizerUserId, userId)),
    sql<boolean>`exists (
      select 1 from ${organizationMembers}
      where ${organizationMembers.organizationId} = ${campaignMetadata.organizationId}
        and ${organizationMembers.userId} = ${userId}
        and ${organizationMembers.role} = 'OWNER'
    )`,
  )!;
}

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
      .select({ organizerUserId: campaignMetadata.organizerUserId, organizationId: campaignMetadata.organizationId })
      .from(campaignMetadata)
      .where(eq(campaignMetadata.id, campaignId))
      .limit(1);

    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.organizationId) {
      const [membership] = await this.database
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, campaign.organizationId),
          eq(organizationMembers.userId, authenticatedUserId),
          eq(organizationMembers.role, "OWNER"),
        ))
        .limit(1);
      if (!membership) throw new ForbiddenException("Organization OWNER membership required");
      return;
    }
    if (campaign.organizerUserId !== authenticatedUserId) {
      throw new ForbiddenException(
        "Only the campaign organizer may manage evidence",
      );
    }
  }
}
