import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardResolverGuard } from "./reward-roles.guard";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardPledgeService } from "./reward-pledge.service";
import {
  resolverReviewCampaignSchema,
  resolverActivateCampaignSchema,
  resolverVerifyProductionSchema,
} from "./reward-campaign.schema";
import { resolveRewardDisputeSchema } from "./reward-pledge.schema";

@Controller("v1/reward/resolver")
@UseGuards(AuthGuard, RewardResolverGuard)
export class RewardResolverController {
  constructor(
    private readonly campaigns: RewardCampaignService,
    private readonly pledges: RewardPledgeService,
  ) {}

  @Get("campaigns")
  listCampaigns() {
    return this.campaigns.listAllForResolver();
  }

  @Get("disputes")
  listDisputes() {
    return this.pledges.listDisputesForResolver();
  }

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

  @Post("campaigns/:id/activate")
  activateCampaign(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolverActivateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid campaign activation payload", issues: parsed.error.issues });
    }
    return this.campaigns.activateCampaignOnchain(req.account!.userId, id, parsed.data.txHash);
  }

  @Post("campaigns/:id/production-verified")
  verifyProduction(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = resolverVerifyProductionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid production verification payload", issues: parsed.error.issues });
    }
    return this.campaigns.recordProductionVerifiedOnchain(req.account!.userId, id, parsed.data.txHash);
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
    return this.pledges.resolveDispute(req.account!.userId, id, parsed.data);
  }

}
