import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardAdminGuard } from "./reward-roles.guard";
import { RewardCampaignService } from "./reward-campaign.service";
import { adminReviewCreatorSchema } from "./reward-campaign.schema";

@Controller("v1/reward/admin")
@UseGuards(AuthGuard, RewardAdminGuard)
export class RewardAdminController {
  constructor(private readonly campaigns: RewardCampaignService) {}

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
