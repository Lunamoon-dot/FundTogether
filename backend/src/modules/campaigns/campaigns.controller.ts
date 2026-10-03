import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
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
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@Req() request: Request) {
    return this.campaignsService.listDrafts(request.wallet!.userId);
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
      request.wallet!.userId,
      parsed.data,
    );
  }

  @Get(":campaignId")
  get(
    @Param("campaignId", new ParseUUIDPipe()) campaignId: string,
    @Req() request: Request,
  ) {
    return this.campaignsService.getDraft(campaignId, request.wallet!.userId);
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
      request.wallet!.userId,
      parsed.data,
    );
  }
}
