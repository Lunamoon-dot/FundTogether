import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { createCampaignDraftSchema } from "./campaign-draft.schema";
import { CampaignsService } from "./campaigns.service";

@Controller("organizations/:organizationId/campaigns")
@UseGuards(AuthGuard)
export class OrganizationCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@Param("organizationId", new ParseUUIDPipe()) organizationId: string, @Req() request: Request) {
    return this.campaignsService.listDrafts(request.account!.userId, organizationId);
  }

  @Post()
  create(
    @Param("organizationId", new ParseUUIDPipe()) organizationId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const parsed = createCampaignDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Campaign details, milestones and acceptance criteria must be complete and valid.",
        issues: parsed.error.issues,
      });
    }
    return this.campaignsService.createDraft(request.account!.userId, parsed.data, organizationId);
  }
}
