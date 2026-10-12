import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { RewardCampaignService } from "./reward-campaign.service";

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
}
