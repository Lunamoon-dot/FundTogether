import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { syncRewardReceiptSchema } from "./reward-campaign.schema";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";

@Controller("v1/reward/editions")
export class RewardEditionsChainController {
  constructor(private readonly indexer: RewardEditionsIndexerService, private readonly publication: RewardEditionsPublicationService) {}

  @Get("deployment")
  deployment() { return this.indexer.deployment(); }

  @Get("campaigns/:id/chain")
  chain(@Param("id", new ParseUUIDPipe()) id: string) { return this.publication.chainCampaign(id); }

  @Get("campaigns/:id/publication-terms")
  @UseGuards(AuthGuard)
  terms(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) { return this.publication.terms(id, req.account!.userId); }

  @Post("sync-receipt")
  @UseGuards(AuthGuard)
  sync(@Body() body: unknown) {
    const parsed = syncRewardReceiptSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Only an Editions transaction hash is accepted");
    return this.indexer.processReceipt(parsed.data.txHash);
  }
}
