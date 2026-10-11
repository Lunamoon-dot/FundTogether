import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { HedRequestDraftService } from "./hed-request-draft.service";

@Controller("v1/disbursement/campaigns/:campaignId/vendors")
@UseGuards(AuthGuard)
export class HedCampaignVendorController {
  constructor(private readonly requests: HedRequestDraftService) {}

  @Get()
  list(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.requests.vendorOptions(campaignId, request.account!.userId);
  }
}
