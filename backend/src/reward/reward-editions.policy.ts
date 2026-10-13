import { ConflictException } from "@nestjs/common";

export function isEditionsCampaign(campaign: { category: string; draftConfig?: unknown }): boolean {
  return campaign.draftConfig != null || campaign.category === "COMICS_ARTBOOK";
}

export function requireLegacyRewardCampaign(campaign: { category: string; draftConfig?: unknown }): void {
  if (isEditionsCampaign(campaign)) {
    throw new ConflictException("FundTogether Editions requires its versioned review and escrow flow; legacy publication and physical fulfillment are unavailable");
  }
}
