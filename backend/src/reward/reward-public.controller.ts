import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { RewardCampaignService } from "./reward-campaign.service";
import { syncRewardReceiptSchema } from "./reward-campaign.schema";

@Controller("v1/reward/public")
export class RewardPublicController {
  constructor(private readonly campaignService: RewardCampaignService) {}

  @Get("campaigns")
  listPublicCampaigns() {
    return this.campaignService.listPublic();
  }

  @Get("campaigns/:id")
  getPublicCampaign(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.campaignService.getById(id);
  }

  @Post("sync-receipt")
  syncReceipt(@Body() body: unknown) {
    const parsed = syncRewardReceiptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid sync receipt payload", issues: parsed.error.issues });
    }
    return this.campaignService.syncReceipt(parsed.data.txHash);
  }
}

