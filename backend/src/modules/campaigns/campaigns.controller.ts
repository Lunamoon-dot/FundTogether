import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from 'zod';
import { CampaignSubmissionService } from './campaign-submission.service';
import { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CampaignsService } from "./campaigns.service";
import {
  createCampaignDraftSchema,
  updateCampaignDraftSchema,
} from "./campaign-draft.schema";

@Controller("campaigns")
@UseGuards(AuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService, private readonly submission: CampaignSubmissionService) {}

  @Get()
  list(@Req() request: Request) {
    return this.campaignsService.listDrafts(request.account!.userId);
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: Request) {
    const parsed = createCampaignDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message:
          "Campaign details, milestones and acceptance criteria must be complete and valid.",
        issues: parsed.error.issues,
      });
    }
    return this.campaignsService.createDraft(
      request.account!.userId,
      parsed.data,
    );
  }

  @Get(':campaignId/submission')
  submissionPlan(@Param('campaignId', new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.submission.get(campaignId, request.account!.userId);
  }

  @Post(':campaignId/submission')
  prepareSubmission(@Param('campaignId', new ParseUUIDPipe()) campaignId: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = z.object({ expectedRevision: z.number().int().positive(), fundingDeadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException('Revision and funding deadline required');
    return this.submission.prepare(campaignId, request.account!.userId, parsed.data.expectedRevision, parsed.data.fundingDeadline);
  }

  @Post(':campaignId/submission/sync')
  syncSubmission(@Param('campaignId', new ParseUUIDPipe()) campaignId: string, @Req() request: Request) {
    return this.submission.sync(campaignId, request.account!.userId);
  }

  @Get(":campaignId")
  get(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Req() request: Request,
  ) {
    return this.campaignsService.getDraft(campaignId, request.account!.userId);
  }

  @Patch(":campaignId")
  update(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = updateCampaignDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message:
          "Campaign details, milestones and expected revision must be valid.",
        issues: parsed.error.issues,
      });
    }
    return this.campaignsService.updateDraft(
      campaignId,
      request.account!.userId,
      parsed.data,
    );
  }

  @Delete(":campaignId")
  remove(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = z.object({ expectedRevision: z.number().int().positive() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Valid expected revision required");
    return this.campaignsService.deleteDraft(campaignId, request.account!.userId, parsed.data.expectedRevision);
  }
}
