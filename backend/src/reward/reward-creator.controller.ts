import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../modules/auth/auth.guard";
import { RewardCampaignService } from "./reward-campaign.service";
import { RewardFulfillmentService } from "./reward-fulfillment.service";
import { RewardPledgeService } from "./reward-pledge.service";
import {
  createRewardCampaignDraftSchema,
  registerRewardOnchainSchema,
  creatorVerificationInputSchema,
  completeRewardCampaignSchema,
} from "./reward-campaign.schema";
import { createFulfillmentBatchSchema } from "./reward-pledge.schema";

@Controller("v1/reward/creator")
@UseGuards(AuthGuard)
export class RewardCreatorController {
  constructor(
    private readonly campaigns: RewardCampaignService,
    private readonly fulfillment: RewardFulfillmentService,
    private readonly pledgeService: RewardPledgeService,
  ) {}

  @Post("profile")
  applyVerification(@Body() body: unknown, @Req() req: Request) {
    const parsed = creatorVerificationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid creator verification payload", issues: parsed.error.issues });
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
      throw new BadRequestException({ message: "Invalid reward campaign payload", issues: parsed.error.issues });
    }
    return this.campaigns.createDraft(req.account!.userId, parsed.data);
  }

  @Get("campaigns/mine")
  listMyCampaigns(@Req() req: Request) {
    return this.campaigns.listByCreator(req.account!.userId);
  }

  @Get("campaigns/:id")
  getCampaign(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.campaigns.getById(id);
  }

  @Post("campaigns/:id/freeze")
  freeze(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.campaigns.freeze(id, req.account!.userId);
  }

  @Post("campaigns/:id/submit-review")
  submitForReview(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
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

  @Post("campaigns/:id/batches")
  createBatch(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = createFulfillmentBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid fulfillment batch payload", issues: parsed.error.issues });
    }
    return this.fulfillment.createBatch(req.account!.userId, id, parsed.data);
  }

  @Get("campaigns/:id/batches")
  listBatches(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.fulfillment.listBatches(id);
  }

  @Get("campaigns/:id/entitlements")
  listEntitlementsToFulfill(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.fulfillment.listEntitlementsToFulfill(req.account!.userId, id);
  }

  @Post("entitlements/:id/delivered")
  markDelivered(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.fulfillment.markDelivered(req.account!.userId, id);
  }

  @Get("entitlements/:id/shipping")
  getDecryptedShipping(@Param("id", new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.pledgeService.getDecryptedShipping(req.account!.userId, id);
  }
}

