import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../../database/schema";
import { DRIZZLE_DB } from "../../../database/database.constants";
import {
  vnextCampaignProjections,
  vnextMilestoneProjections,
  vnextReviewProjections,
} from "../../../database/schema";
import { VNEXT_CONNECTION, type VNextConnection } from "../../../indexer/vnext-indexer.service";

@Controller("v1/fundtogether/vnext")
export class VNextController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(VNEXT_CONNECTION) private readonly connection: VNextConnection | null,
  ) {}

  @Get("deployment")
  deployment() {
    if (!this.connection) return { configured: false };
    const { manifest } = this.connection;
    return {
      configured: true,
      chainId: manifest.chainId,
      campaignEscrow: manifest.campaignEscrow,
      juryRegistry: manifest.juryRegistry,
      juryReview: manifest.juryReview,
      tokenAddress: manifest.tokenAddress,
      policyHash: manifest.policyHash,
      abiVersion: manifest.abiVersion,
    };
  }

  @Get("campaigns/:campaignId")
  async campaign(@Param("campaignId") campaignId: string) {
    const [projection] = await this.db.select().from(vnextCampaignProjections).where(
      and(eq(vnextCampaignProjections.streamId, this.streamId()), eq(vnextCampaignProjections.onchainCampaignId, campaignId)),
    );
    if (!projection) throw new NotFoundException("VNext campaign projection not found");
    return projection;
  }

  @Get("campaigns/:campaignId/milestones")
  async milestones(@Param("campaignId") campaignId: string) {
    return this.db.select().from(vnextMilestoneProjections).where(
      and(eq(vnextMilestoneProjections.streamId, this.streamId()), eq(vnextMilestoneProjections.onchainCampaignId, campaignId)),
    );
  }

  @Get("reviews/:reviewCaseId")
  async review(@Param("reviewCaseId") reviewCaseId: string) {
    const [projection] = await this.db.select().from(vnextReviewProjections).where(
      and(eq(vnextReviewProjections.streamId, this.streamId()), eq(vnextReviewProjections.reviewCaseId, reviewCaseId.toLowerCase())),
    );
    if (!projection) throw new NotFoundException("VNext review projection not found");
    return projection;
  }

  private streamId() {
    if (!this.connection) throw new NotFoundException("VNext deployment is not configured");
    return `vnext:${this.connection.manifest.chainId}:${this.connection.manifest.campaignEscrow}:${this.connection.manifest.genesisHash}`;
  }
}
