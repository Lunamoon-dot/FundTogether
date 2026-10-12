import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardFulfillmentService } from "./reward-fulfillment.service";
import { resolverReviewCampaignSchema } from "./reward-campaign.schema";
import { resolveRewardDisputeSchema } from "./reward-pledge.schema";

@Controller("v1/reward/resolver")
@UseGuards(AuthGuard)
export class RewardResolverController {
  constructor(
    private readonly campaigns: RewardCampaignService,
    private readonly fulfillment: RewardFulfillmentService,
  ) {}

  @Post("campaigns/:id/review")
  reviewCampaign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolverReviewCampaignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid resolver review payload", issues: parsed.error.issues });
    }
    return this.campaigns.resolverReview(req.account!.userId, id, parsed.data);
  }

  @Post("disputes/:id/resolve")
  resolveDispute(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolveRewardDisputeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid dispute resolution payload", issues: parsed.error.issues });
    }
    return this.fulfillment.resolveDispute(req.account!.userId, id, parsed.data);
  }
}
