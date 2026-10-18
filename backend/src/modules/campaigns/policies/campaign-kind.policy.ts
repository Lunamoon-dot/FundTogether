import { ConflictException } from "@nestjs/common";

export function isCampaignKind(campaign: { category: string; draftConfig?: unknown }): boolean {
  return campaign.draftConfig != null || campaign.category === "COMICS_ARTBOOK";
}

export function requireCurrentCampaign(campaign: { category: string; draftConfig?: unknown }): void {
  if (isCampaignKind(campaign)) {
    throw new ConflictException("FundTogether Campaign requires its versioned review and escrow flow; the previous publication and physical fulfillment flow is unavailable");
  }
}
