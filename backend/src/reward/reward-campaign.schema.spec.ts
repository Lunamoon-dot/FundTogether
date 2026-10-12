import { createRewardCampaignDraftSchema, rewardTierInputSchema } from "./reward-campaign.schema";

describe("RewardCampaignSchema", () => {
  it("validates valid reward tier input", () => {
    const validTier = {
      title: "Digital Comic Tier",
      description: "Get full HD digital PDF and art wallpapers.",
      price: "50000000", // 50 USDC
      maxQuantity: 500,
      isDigital: true,
      rewardItems: ["Digital PDF (HD)", "Digital Artbook", "Wallpapers"],
    };
    const parsed = rewardTierInputSchema.safeParse(validTier);
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive price or invalid quantity in tier input", () => {
    const invalidTier = {
      title: "Free Tier",
      description: "Invalid free tier",
      price: "0",
      maxQuantity: -5,
      isDigital: false,
      rewardItems: ["Item"],
    };
    const parsed = rewardTierInputSchema.safeParse(invalidTier);
    expect(parsed.success).toBe(false);
  });

  it("validates full comic crowdfunding campaign draft", () => {
    const validCampaign = {
      title: "The Cyberpunk Saga - Volume 1",
      pitch: "An epic 120-page cyberpunk comic book printed in premium hardcover.",
      story: "In a neon-lit metropolis, an underground hacker uncovers a corporate conspiracy. We have completed the script and line art; this campaign funds the offset print run.",
      category: "COMICS" as const,
      goal: "4000000000", // 4,000 USDC
      fundingDuration: 2592000, // 30 days
      policyHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      tiers: [
        {
          title: "Digital Edition",
          description: "High-resolution PDF copy.",
          price: "25000000",
          maxQuantity: 1000,
          isDigital: true,
          rewardItems: ["PDF Edition"],
        },
        {
          title: "Hardcover Book",
          description: "Physical offset printed hardcover book with foil stamping.",
          price: "50000000",
          maxQuantity: 300,
          isDigital: false,
          rewardItems: ["Hardcover Book", "Bookmark"],
        },
      ],
    };
    const parsed = createRewardCampaignDraftSchema.safeParse(validCampaign);
    expect(parsed.success).toBe(true);
  });

  it("rejects campaigns with zero tiers or invalid policy hash", () => {
    const invalidCampaign = {
      title: "No Tiers Campaign",
      pitch: "Invalid pitch without tiers",
      story: "Detailed story here with sufficient length to pass the story validation length check.",
      goal: "1000000000",
      fundingDuration: 86400,
      policyHash: "invalid-hash",
      tiers: [],
    };
    const parsed = createRewardCampaignDraftSchema.safeParse(invalidCampaign);
    expect(parsed.success).toBe(false);
  });
});
