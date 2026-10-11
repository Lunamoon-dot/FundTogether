import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { HedReviewService } from "./hed-review.service";

@Controller("v1/disbursement/reviews")
@UseGuards(AuthGuard)
export class HedReviewQueueController {
  constructor(private readonly reviews: HedReviewService) {}
  @Get("pending") pending(@Req() request: Request) { return this.reviews.pending(request.account!.userId); }
  @Get("campaigns/pending") pendingCampaigns(@Req() request: Request) { return this.reviews.pendingCampaigns(request.account!.userId); }
  @Post("campaigns/:campaignId/activation") prepareActivation(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.reviews.prepareActivation(campaignId, request.account!.userId);
  }
  @Get("delivery/pending") pendingDelivery(@Req() request: Request) { return this.reviews.pendingDelivery(request.account!.userId); }
  @Post("delivery/:packageId/prepare") prepareDelivery(@Param("packageId", new ParseUUIDPipe()) packageId: string, @Req() request: Request) {
    return this.reviews.prepareDelivery(packageId, request.account!.userId);
  }
}
