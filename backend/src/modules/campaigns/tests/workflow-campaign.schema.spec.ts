import { createCampaignDraftSchema, creatorVerificationInputSchema } from "../schemas/campaign.schema";
import { campaignDraft } from "./fixtures/draft.fixture";

describe("FundTogether Campaign draft validation", () => {
  it("accepts and preserves exactly one standard PDF benefit without inventory", () => {
    expect(createCampaignDraftSchema.parse(campaignDraft())).toEqual(campaignDraft());
  });
  it("rejects retired delivery fields", () => {
    const input = campaignDraft() as any;
    input.tiers[0].estimatedDeliveryWindow = {
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-11-13T00:00:00.000Z",
    };
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["COMICS", "ARTBOOK", "ILLUSTRATION", "OTHER", "GAMES", "SOFTWARE", undefined])("rejects category %s", category => {
    expect(createCampaignDraftSchema.safeParse({ ...campaignDraft(), category }).success).toBe(false);
  });
  it.each(["PHYSICAL_ITEM", "SHIPPING", "PHYSICAL_REDEMPTION", "REDEEM_FOR_MERCH", "DIGITAL_ACCESS", "DIGITAL_LICENSE", undefined])( "rejects benefit type %s", type => {
    const input = campaignDraft();
    (input.tiers[0].benefitItems[0] as any).type = type;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["EPUB", "ZIP", "pdf", undefined])("rejects format %s", format => {
    const input = campaignDraft();
    (input.tiers[0].benefitItems[0] as any).format = format;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["mode", "policyVersion"])("requires the exact %s", field => {
    expect(createCampaignDraftSchema.safeParse({ ...campaignDraft(), [field]: undefined }).success).toBe(false);
    expect(createCampaignDraftSchema.safeParse({ ...campaignDraft(), [field]: "unsupported" }).success).toBe(false);
  });
  it.each([0, 2])("rejects %s tiers or benefit items", count => {
    const input = campaignDraft();
    expect(createCampaignDraftSchema.safeParse({ ...input, tiers: Array(count).fill(input.tiers[0]) }).success).toBe(false);
    input.tiers[0].benefitItems = Array(count).fill(input.tiers[0].benefitItems[0]);
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["LIMITED", "COLLECTIBLE", "EARLY_BIRD", undefined])("rejects tier kind %s", tierType => {
    const input = campaignDraft();
    (input.tiers[0] as any).tierType = tierType;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["shipping", "address", "phone", "tracking", "carrier", "physical", "maxQuantity", "isDigital", "creatorUserId", "policyHash"])("rejects extra %s at every level", field => {
    const input = campaignDraft();
    expect(createCampaignDraftSchema.safeParse({ ...input, [field]: false }).success).toBe(false);
    expect(createCampaignDraftSchema.safeParse({ ...input, tiers: [{ ...input.tiers[0], [field]: null }] }).success).toBe(false);
    input.tiers[0].benefitItems[0] = { ...input.tiers[0].benefitItems[0], [field]: "injected" } as any;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["0", "-1", "1.5", "1e6", "01", 1, (2n ** 256n).toString()])("rejects invalid amount %s", amount => {
    const input = campaignDraft();
    expect(createCampaignDraftSchema.safeParse({ ...input, goal: amount }).success).toBe(false);
    (input.tiers[0] as any).price = amount;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it("preserves exact large amounts and existing technical duration bounds", () => {
    const input = campaignDraft();
    input.goal = (2n ** 256n - 1n).toString();
    expect(createCampaignDraftSchema.parse(input).goal).toBe(input.goal);
    for (const fundingDuration of [86400, 5184000]) {
      expect(createCampaignDraftSchema.safeParse({ ...input, fundingDuration }).success).toBe(true);
    }
    for (const fundingDuration of [86399, 5184001, 86400.5]) {
      expect(createCampaignDraftSchema.safeParse({ ...input, fundingDuration }).success).toBe(false);
    }
  });
  it.each(["Redeem for merch later", "Includes a printed hardcover book", "Shipping after release", "Kèm sách in và quà tặng vật lý", "Phiếu đổi hàng sau này"])("rejects explicit physical promise: %s", promise => {
    const input = campaignDraft();
    input.tiers[0].benefitItems[0].description = promise;
    expect(createCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
});

describe("Creator original-work pledge validation", () => {
  const profile = {
    studioWalletLinkId: "00000000-0000-4000-8000-000000000001",
    displayName: "Studio Neon Comics",
    bio: "Independent comic creator biography.",
    ipDeclaration: "I own the rights to publish this original work.",
    originalWorkPledge: true as const,
  };

  it("accepts only an explicit affirmative pledge", () => {
    expect(creatorVerificationInputSchema.parse(profile).originalWorkPledge).toBe(true);
  });

  it.each([false, null, undefined])("rejects pledge value %s", originalWorkPledge => {
    expect(creatorVerificationInputSchema.safeParse({ ...profile, originalWorkPledge }).success).toBe(false);
  });
});
