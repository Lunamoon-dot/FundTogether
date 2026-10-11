import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedCampaignDraftSchema } from "./hed-campaign-draft.schema";
import { HedCampaignDraftService } from "./hed-campaign-draft.service";

@Controller("v1/disbursement/campaigns")
@UseGuards(AuthGuard)
export class HedCampaignDraftController {
  constructor(private readonly drafts: HedCampaignDraftService) {}
  @Get("organization/:organizationId")
  list(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Req() request: Request) {
    return this.drafts.list(organizationId, request.account!.userId);
  }
  @Post("organization/:organizationId")
  create(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedCampaignDraftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "HED campaign draft is incomplete or invalid", issues: parsed.error.issues });
    return this.drafts.create(organizationId, request.account!.userId, parsed.data);
  }
  @Post(":campaignId/freeze")
  freeze(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.drafts.freeze(campaignId, request.account!.userId);
  }
  @Post(":campaignId/onchain")
  registerOnchain(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body("onchainCampaignId") onchainCampaignId: unknown, @Req() request: Request) {
    if (typeof onchainCampaignId !== "string" || !/^\d+$/.test(onchainCampaignId)) throw new BadRequestException("HED on-chain campaign ID is invalid");
    return this.drafts.registerOnchain(campaignId, request.account!.userId, onchainCampaignId);
  }
}
