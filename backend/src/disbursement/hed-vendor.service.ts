import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { HedBlockchainService } from "./hed-blockchain.service";

@Injectable()
export class HedVendorService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly chain: HedBlockchainService) {}

  async requests(userId: string) {
    const rows = await this.db.select({ requestId: schema.hedRequestDrafts.id, requestHash: schema.hedRequestDrafts.requestHash,
      content: schema.hedRequestDrafts.content, vendorWallet: schema.disbursementRequests.vendorWallet,
      onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId, onchainRequestId: schema.disbursementRequests.onchainRequestId })
      .from(schema.disbursementRequests).innerJoin(schema.hedRequestDrafts, eq(schema.hedRequestDrafts.id, schema.disbursementRequests.requestDraftId))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .innerJoin(schema.walletLinks, and(eq(schema.walletLinks.userId, userId), eq(schema.walletLinks.chainId, "31339"),
        sql`lower(${schema.walletLinks.address}) = lower(${schema.disbursementRequests.vendorWallet})`))
      .where(and(isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.disbursementRequests.onchainRequestId)));
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshots = new Map<string, Awaited<ReturnType<HedBlockchainService["snapshot"]>>>();
    for (const row of rows) if (!snapshots.has(row.onchainCampaignId!)) snapshots.set(row.onchainCampaignId!, await this.chain.snapshot(BigInt(row.onchainCampaignId!), block.number));
    return rows.filter(row => snapshots.get(row.onchainCampaignId!)?.requests[Number(row.onchainRequestId!)]?.state === "APPROVED_RESERVED");
  }
}
