import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../modules/auth/auth.guard";
import { AdvanceCampaignService } from "./advance-campaign.service";
import { giftDraftSchema, giftUpdateSchema, submissionRevisionSchema } from "./advance-campaign.schema";

function parse<T>(validator: z.ZodType<T>, body: unknown): T {
  const result = validator.safeParse(body);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@Controller("v1/advance")
@UseGuards(AuthGuard)
export class AdvanceCampaignController {
  constructor(private readonly campaigns: AdvanceCampaignService) {}
  @Post("organizations/:id/campaigns")
  @Header("Cache-Control", "private, no-store")
  create(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.campaigns.create(id, req.account!.userId, parse(giftDraftSchema, body));
  }
  @Get("organizations/:id/campaigns")
  @Header("Cache-Control", "private, no-store")
  list(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) { return this.campaigns.list(id, req.account!.userId); }
  @Get("campaigns/:id")
  @Header("Cache-Control", "private, no-store")
  get(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) { return this.campaigns.get(id, req.account!.userId); }
  @Patch("campaigns/:id")
  @Header("Cache-Control", "private, no-store")
  update(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.campaigns.update(id, req.account!.userId, parse(giftUpdateSchema, body));
  }
  @Post("campaigns/:id/submission")
  @Header("Cache-Control", "private, no-store")
  prepare(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Body() body: unknown) {
    return this.campaigns.prepareSubmission(id, req.account!.userId, parse(submissionRevisionSchema, body).expectedRevision);
  }
  @Get("campaigns/:id/submission")
  @Header("Cache-Control", "private, no-store")
  async submission(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request) {
    return (await this.campaigns.get(id, req.account!.userId)).submissionPlan;
  }
}
