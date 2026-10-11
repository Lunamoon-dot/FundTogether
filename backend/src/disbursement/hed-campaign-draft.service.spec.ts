import { hedCommitmentHash } from "./hed-campaign-draft.service";
import type { HedCampaignDraftInput } from "./hed-campaign-draft.schema";

const draft: HedCampaignDraftInput = { title: "Quà cứu trợ", description: "Mua và trao quà cho các hộ đang cần hỗ trợ khẩn cấp.",
  purpose: "Mua và trao quà cứu trợ", beneficiaryScope: "Các hộ dân tại khu vực bị ảnh hưởng", allowedExpenseCategories: ["GOODS"],
  outcomeCriteria: ["Có biên bản trao quà và danh sách đã che dữ liệu cá nhân"], goal: "2000000000", fundingDuration: 86_400,
  policyHash: `0x${"1".repeat(64)}` };

describe("hedCommitmentHash", () => {
  it("binds goal, policy and outcome criteria but not editable display text", () => {
    expect(hedCommitmentHash(draft)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hedCommitmentHash({ ...draft, title: "Tên chỉ để hiển thị" })).toBe(hedCommitmentHash(draft));
    expect(hedCommitmentHash({ ...draft, goal: "2000000001" })).not.toBe(hedCommitmentHash(draft));
  });
});
