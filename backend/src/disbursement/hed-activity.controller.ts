import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedActivitySchema } from "./hed-activity.schema";
import { HedActivityService } from "./hed-activity.service";

@Controller("v1/disbursement/campaigns/:campaignId/activities")
@UseGuards(AuthGuard)
export class HedActivityController {
  constructor(private readonly activities: HedActivityService) {}
  @Get() list(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) { return this.activities.list(campaignId, request.account!.userId); }
  @Post() create(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedActivitySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "HED activity is incomplete or invalid", issues: parsed.error.issues });
    return this.activities.create(campaignId, request.account!.userId, parsed.data);
  }
  @Post(":activityId/freeze") freeze(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("activityId", new ParseUUIDPipe()) activityId: string, @Req() request: Request) { return this.activities.freeze(campaignId, activityId, request.account!.userId); }
  @Post(":activityId/onchain") register(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("activityId", new ParseUUIDPipe()) activityId: string, @Body("onchainActivityId") onchainActivityId: unknown, @Req() request: Request) {
    if (typeof onchainActivityId !== "string" || !/^\d+$/.test(onchainActivityId)) throw new BadRequestException("HED on-chain activity ID is invalid");
    return this.activities.registerOnchain(campaignId, activityId, request.account!.userId, onchainActivityId);
  }
}
