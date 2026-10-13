import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardCampaignService } from "./reward-campaign.service";
import {
  createRewardCampaignDraftSchema,
  registerRewardOnchainSchema,
  creatorVerificationInputSchema,
  completeRewardCampaignSchema,
  assertEmptyRewardBody,
} from "./reward-campaign.schema";

@Controller("v1/reward/creator")
@UseGuards(AuthGuard)
export class RewardCreatorController {
  constructor(
    private readonly campaigns: RewardCampaignService,
  ) {}

  @Post("profile")
  applyVerification(@Body() body: unknown, @Req() req: Request) {
    const parsed = creatorVerificationInputSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map(i => `${i.path.join('.') || 'field'}: ${i.message}`).join(', ');
      throw new BadRequestException({ message: `Invalid creator verification payload: ${details}`, issues: parsed.error.issues });
    }
    return this.campaigns.applyCreatorVerification(req.account!.userId, parsed.data);
  }

  @Get("profile")
  getMyProfile(@Req() req: Request) {
    return this.campaigns.getCreatorProfile(req.account!.userId);
  }

  @Post("campaigns")
  createCampaign(@Body() body: unknown, @Req() req: Request) {
    const parsed = createRewardCampaignDraftSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map(i => `${i.path.join('.') || 'field'}: ${i.message}`).join(', ');
      throw new BadRequestException({ message: `Invalid reward campaign payload: ${details}`, issues: parsed.error.issues });
    }
    return this.campaigns.createDraft(req.account!.userId, parsed.data);
  }

  @Get("campaigns/mine")
  listMyCampaigns(@Req() req: Request) {
    return this.campaigns.listByCreator(req.account!.userId);
  }

  @Get("campaigns/:id")
  getCampaign(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.campaigns.getById(id, req.account!.userId);
  }

  @Post("campaigns/:id/freeze")
  freeze(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    assertEmptyRewardBody(body);
    return this.campaigns.freeze(id, req.account!.userId);
  }

  @Post("campaigns/:id/submit-review")
  submitForReview(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request, @Body() body: unknown) {
    assertEmptyRewardBody(body);
    return this.campaigns.submitForReview(id, req.account!.userId);
  }

  @Post("campaigns/:id/onchain")
  registerOnchain(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = registerRewardOnchainSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid onchain ID", issues: parsed.error.issues });
    }
    return this.campaigns.registerOnchain(
      id,
      req.account!.userId,
      parsed.data.onchainCampaignId,
      parsed.data.txHash,
    );
  }

  @Post("campaigns/:id/complete")
  completeCampaign(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = completeRewardCampaignSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid complete campaign payload", issues: parsed.error.issues });
    }
    return this.campaigns.completeCampaignOnchain(req.account!.userId, id, parsed.data.txHash);
  }

}
