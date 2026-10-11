import { Controller, Get, Header, Inject, NotFoundException, Param, Res, ServiceUnavailableException, StreamableFile } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Response } from "express";
import { Readable } from "node:stream";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { disbursementCampaignProjection } from "../database/schema";
import { HedIndexerService } from "./hed-indexer.service";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { HedBlockchainService } from "./hed-blockchain.service";

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
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly indexer: HedIndexerService,
    private readonly storage: EvidenceStorageService, private readonly chain: HedBlockchainService) {}
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

  @Get("campaigns/:campaignId/evidence/:publicHash")
  @Header("Cache-Control", "public, no-store")
  async evidence(@Param("campaignId") campaignId: string, @Param("publicHash") publicHash: string, @Res({ passthrough: true }) response: Response) {
    if (!/^\d+$/.test(campaignId) || !/^0x[0-9a-f]{64}$/.test(publicHash)) throw new NotFoundException("HED public evidence not found");
    const status = await this.indexer.status(); if (status.status !== "ready") throw new ServiceUnavailableException("HED indexer is not caught up");
    const [projection] = await this.db.select().from(disbursementCampaignProjection).where(and(eq(disbursementCampaignProjection.streamId, this.indexer.streamKey),
      eq(disbursementCampaignProjection.onchainCampaignId, campaignId))).limit(1);
    const [record] = await this.db.select({ evidence: schema.hedEvidencePackages }).from(schema.hedEvidencePackages).innerJoin(schema.disbursementCampaigns,
      eq(schema.disbursementCampaigns.campaignMetadataId, schema.hedEvidencePackages.campaignMetadataId)).where(and(eq(schema.disbursementCampaigns.onchainCampaignId, campaignId),
        eq(sql`${schema.hedEvidencePackages.content}->>'publicHash'`, publicHash))).limit(1);
    if (!projection || !record) throw new NotFoundException("HED public evidence not found");
    const content = record.evidence.content;
    const block = await this.chain.client.getBlock({ blockTag: "latest" }); const snapshot = await this.chain.snapshot(BigInt(campaignId), block.number);
    if (content.kind === "DELIVERY") {
      const [request] = await this.db.select().from(schema.disbursementRequests).where(eq(schema.disbursementRequests.requestDraftId, content.requestDraftId)).limit(1);
      const state = request?.onchainRequestId === null || request?.onchainRequestId === undefined ? undefined : snapshot.requests[Number(request.onchainRequestId)]?.state;
      if (state !== "DELIVERY_CANDIDATE" && state !== "FINANCIALLY_SETTLED") throw new NotFoundException("HED public evidence not available");
    } else {
      const [activity] = await this.db.select().from(schema.hedActivities).where(eq(schema.hedActivities.id, content.activityId)).limit(1);
      const state = activity?.onchainActivityId === null || activity?.onchainActivityId === undefined ? undefined : snapshot.activities[Number(activity.onchainActivityId)]?.state;
      if (state !== "OUTCOME_CANDIDATE" && state !== "VERIFIED") throw new NotFoundException("HED public evidence not available");
    }
    const object = await this.storage.get(content.publicDocumentId); if (!object.Body) throw new NotFoundException("HED public evidence not found");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(object.Body as Readable, { type: "application/octet-stream", disposition: "attachment; filename=hed-public-evidence" });
  }
}
