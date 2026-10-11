import { Controller, Get, Header, Inject, NotFoundException, Param, ServiceUnavailableException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { disbursementCampaignProjection } from "../database/schema";
import { HedBlockchainService } from "./hed-blockchain.service";
import { HedIndexerService } from "./hed-indexer.service";

@Controller("health")
export class HedHealthController {
  constructor(private readonly chain: HedBlockchainService, private readonly indexer: HedIndexerService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async health() {
    const [rpc, indexer] = await Promise.allSettled([this.chain.verifyDeployment(), this.indexer.status()]);
    return { context: this.chain.context, status: rpc.status === "fulfilled" && indexer.status === "fulfilled" && indexer.value.status === "ready" ? "ready" : "degraded",
      rpc: rpc.status === "fulfilled" ? "ready" : "unavailable_or_identity_mismatch",
      indexer: indexer.status === "fulfilled" ? indexer.value : { status: "error", error: "HED synchronization unavailable" } };
  }
}

@Controller("v1/disbursement/public")
export class HedPublicController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly indexer: HedIndexerService) {}
  @Get("campaigns/:campaignId")
  @Header("Cache-Control", "no-store")
  async campaign(@Param("campaignId") campaignId: string) {
    if (!/^\d+$/.test(campaignId)) throw new NotFoundException("HED campaign not found");
    const status = await this.indexer.status();
    if (status.status !== "ready") throw new ServiceUnavailableException("HED indexer is not caught up");
    const [row] = await this.db.select().from(disbursementCampaignProjection).where(and(
      eq(disbursementCampaignProjection.streamId, this.indexer.streamKey), eq(disbursementCampaignProjection.onchainCampaignId, campaignId),
    )).limit(1);
    if (!row) throw new NotFoundException("HED campaign not found");
    return row.snapshot;
  }
}
