import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { hedRequestDraftSchema } from "./hed-request-draft.schema";
import { HedRequestDraftService } from "./hed-request-draft.service";

@Controller("v1/disbursement/campaigns/:campaignId/requests")
@UseGuards(AuthGuard)
export class HedRequestDraftController {
  constructor(private readonly requests: HedRequestDraftService) {}

  @Get()
  list(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.requests.list(campaignId, request.account!.userId);
  }

  @Post()
  create(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = hedRequestDraftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: "HED payment request is incomplete or invalid", issues: parsed.error.issues });
    return this.requests.create(campaignId, request.account!.userId, parsed.data);
  }

  @Post(":requestId/freeze")
  freeze(@Param("campaignId", new ParseUUIDPipe()) campaignId: string, @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Req() request: Request) {
    return this.requests.freeze(campaignId, requestId, request.account!.userId);
  }
}
