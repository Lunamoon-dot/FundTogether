import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";

@Injectable()
export class HedVendorService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async requests(userId: string) {
    return this.db.select({ requestId: schema.hedRequestDrafts.id, requestHash: schema.hedRequestDrafts.requestHash,
      content: schema.hedRequestDrafts.content, vendorWallet: schema.disbursementRequests.vendorWallet,
      onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId, onchainRequestId: schema.disbursementRequests.onchainRequestId })
      .from(schema.disbursementRequests).innerJoin(schema.hedRequestDrafts, eq(schema.hedRequestDrafts.id, schema.disbursementRequests.requestDraftId))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .innerJoin(schema.walletLinks, and(eq(schema.walletLinks.userId, userId), eq(schema.walletLinks.chainId, "31339"),
        sql`lower(${schema.walletLinks.address}) = lower(${schema.disbursementRequests.vendorWallet})`))
      .where(and(isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.disbursementRequests.onchainRequestId)));
  }
}
