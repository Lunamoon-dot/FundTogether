import { hedCampaignDraftSchema } from "./hed-campaign-draft.schema";

const valid = { title: "Quà cứu trợ", description: "Mua và trao quà cho các hộ đang cần hỗ trợ khẩn cấp.",
  purpose: "Mua và trao quà cứu trợ", beneficiaryScope: "Các hộ dân tại khu vực bị ảnh hưởng", allowedExpenseCategories: ["GOODS"],
  outcomeCriteria: ["Có biên bản trao quà và danh sách đã che dữ liệu cá nhân"], goal: "2000000000", fundingDuration: 86_400,
  policyHash: `0x${"1".repeat(64)}` };

describe("hedCampaignDraftSchema", () => {
  it("accepts a bounded fixed-policy HED draft", () => expect(hedCampaignDraftSchema.parse(valid).goal).toBe("2000000000"));
  it("rejects decimal money, arbitrary fields and an unbounded funding duration", () => {
    expect(hedCampaignDraftSchema.safeParse({ ...valid, goal: "1.5" }).success).toBe(false);
    expect(hedCampaignDraftSchema.safeParse({ ...valid, fundingDuration: 2_592_001 }).success).toBe(false);
    expect(hedCampaignDraftSchema.safeParse({ ...valid, resolver: "client-selected" }).success).toBe(false);
  });
});
