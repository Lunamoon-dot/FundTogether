import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../../auth/auth.guard";
import { AdminGuard } from "../../auth/roles.guard";
import { CampaignWorkflowService } from "./campaign.service";
import { adminReviewCreatorSchema } from "../schemas/campaign.schema";

@Controller("v1/fundtogether/admin")
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly campaigns: CampaignWorkflowService) {}

  @Get("creators")
  listCreators() {
    return this.campaigns.listCreatorProfilesForAdmin();
  }

  @Post("creators/:id/review")
  reviewCreator(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = adminReviewCreatorSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid creator review payload", issues: parsed.error.issues });
    }
    return this.campaigns.adminReviewCreator(req.account!.userId, id, parsed.data);
  }
}

