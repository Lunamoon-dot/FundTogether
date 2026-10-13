import { createRewardCampaignDraftSchema } from "./reward-campaign.schema";
import { editionsDraft } from "./testing/editions-draft.fixture";

describe("FundTogether Editions draft validation", () => {
  it("accepts and preserves exactly one standard PDF reward without inventory", () => {
    expect(createRewardCampaignDraftSchema.parse(editionsDraft())).toEqual(editionsDraft());
  });
  it.each(["COMICS", "ARTBOOK", "ILLUSTRATION", "OTHER", "GAMES", "SOFTWARE", undefined])("rejects category %s", category => {
    expect(createRewardCampaignDraftSchema.safeParse({ ...editionsDraft(), category }).success).toBe(false);
  });
  it.each(["PHYSICAL_ITEM", "SHIPPING", "PHYSICAL_REDEMPTION", "REDEEM_FOR_MERCH", "DIGITAL_ACCESS", "DIGITAL_LICENSE", undefined])("rejects reward type %s", type => {
    const input = editionsDraft();
    (input.tiers[0].rewardItems[0] as any).type = type;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["EPUB", "ZIP", "pdf", undefined])("rejects format %s", format => {
    const input = editionsDraft();
    (input.tiers[0].rewardItems[0] as any).format = format;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["mode", "policyVersion"])("requires the exact %s", field => {
    expect(createRewardCampaignDraftSchema.safeParse({ ...editionsDraft(), [field]: undefined }).success).toBe(false);
    expect(createRewardCampaignDraftSchema.safeParse({ ...editionsDraft(), [field]: "legacy" }).success).toBe(false);
  });
  it.each([0, 2])("rejects %s tiers or reward items", count => {
    const input = editionsDraft();
    expect(createRewardCampaignDraftSchema.safeParse({ ...input, tiers: Array(count).fill(input.tiers[0]) }).success).toBe(false);
    input.tiers[0].rewardItems = Array(count).fill(input.tiers[0].rewardItems[0]);
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["LIMITED", "COLLECTIBLE", "EARLY_BIRD", undefined])("rejects tier kind %s", tierType => {
    const input = editionsDraft();
    (input.tiers[0] as any).tierType = tierType;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["shipping", "address", "phone", "tracking", "carrier", "physical", "maxQuantity", "isDigital", "creatorUserId", "policyHash"])("rejects extra %s at every level", field => {
    const input = editionsDraft();
    expect(createRewardCampaignDraftSchema.safeParse({ ...input, [field]: false }).success).toBe(false);
    expect(createRewardCampaignDraftSchema.safeParse({ ...input, tiers: [{ ...input.tiers[0], [field]: null }] }).success).toBe(false);
    input.tiers[0].rewardItems[0] = { ...input.tiers[0].rewardItems[0], [field]: "injected" } as any;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it.each(["0", "-1", "1.5", "1e6", "01", 1, (2n ** 256n).toString()])("rejects invalid amount %s", amount => {
    const input = editionsDraft();
    expect(createRewardCampaignDraftSchema.safeParse({ ...input, goal: amount }).success).toBe(false);
    (input.tiers[0] as any).price = amount;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
  it("preserves exact large amounts and existing technical duration bounds", () => {
    const input = editionsDraft();
    input.goal = (2n ** 256n - 1n).toString();
    expect(createRewardCampaignDraftSchema.parse(input).goal).toBe(input.goal);
    for (const fundingDuration of [86400, 5184000]) {
      expect(createRewardCampaignDraftSchema.safeParse({ ...input, fundingDuration }).success).toBe(true);
    }
    for (const fundingDuration of [86399, 5184001, 86400.5]) {
      expect(createRewardCampaignDraftSchema.safeParse({ ...input, fundingDuration }).success).toBe(false);
    }
  });
  it.each(["Redeem for merch later", "Includes a printed hardcover book", "Shipping after release", "Kèm sách in và quà tặng vật lý", "Phiếu đổi hàng sau này"])("rejects explicit physical promise: %s", promise => {
    const input = editionsDraft();
    input.tiers[0].rewardItems[0].description = promise;
    expect(createRewardCampaignDraftSchema.safeParse(input).success).toBe(false);
  });
});
