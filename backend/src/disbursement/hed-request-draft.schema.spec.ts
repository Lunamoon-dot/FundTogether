import { hedRequestDraftSchema, hedRequestHash } from "./hed-request-draft.schema";

const evidence = "11111111-1111-4111-8111-111111111111";
const activity = "22222222-2222-4222-8222-222222222222";
const request = { activityId: activity, purpose: "Mua nhu yếu phẩm cho đợt trao quà đầu tiên",
  itemLines: [{ description: "Gói nhu yếu phẩm", quantity: 2, unitAmount: "500000" }], amount: "1000000", deposit: "200000",
  expectedDeliveryAt: "2026-11-01T00:00:00.000Z", acceptanceCriteria: ["Có biên bản bàn giao và ảnh hàng hóa"],
  terms: "Giao đủ số lượng, giữ hàng đúng mô tả và chấp nhận quy trình nghiệm thu.", needEvidenceReferences: [evidence] };

describe("HED request schema", () => {
  it("requires exact integer line accounting and bounds deposit to amount", () => {
    expect(hedRequestDraftSchema.parse(request).amount).toBe("1000000");
    expect(hedRequestDraftSchema.safeParse({ ...request, amount: "999999" }).success).toBe(false);
    expect(hedRequestDraftSchema.safeParse({ ...request, deposit: "1000001" }).success).toBe(false);
  });

  it("binds the frozen request to campaign, activity commitment and approved terms", () => {
    const campaign = `0x${"1".repeat(64)}`, activityHash = `0x${"2".repeat(64)}`, report = `0x${"3".repeat(64)}`;
    expect(hedRequestHash(campaign, activityHash, report, request)).not.toBe(hedRequestHash(campaign, activityHash, report, { ...request, deposit: "0" }));
    expect(hedRequestHash(campaign, activityHash, report, request)).not.toBe(hedRequestHash(campaign, `0x${"4".repeat(64)}`, report, request));
  });
});
