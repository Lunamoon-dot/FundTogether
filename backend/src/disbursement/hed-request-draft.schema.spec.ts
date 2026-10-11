import { hedRequestDraftSchema } from "./hed-request-draft.schema";
import { hedVendorVerificationSchema } from "./hed-vendor-verification.schema";
import { hedRequestHash } from "./hed-request-draft.service";

const vendor = "11111111-1111-4111-8111-111111111111";
const request = { vendorVerificationId: vendor, activityReference: "gift-distribution-01", purpose: "Mua nhu yếu phẩm cho đợt trao quà đầu tiên",
  itemLines: [{ description: "Gói nhu yếu phẩm", quantity: 2, unitAmount: "500000" }], amount: "1000000", deposit: "200000",
  expectedDeliveryAt: "2026-11-01T00:00:00.000Z", acceptanceCriteria: ["Có biên bản bàn giao và ảnh hàng hóa"],
  terms: "Giao đủ số lượng, giữ hàng đúng mô tả và chấp nhận quy trình nghiệm thu.", needEvidenceReferences: [vendor] };

describe("HED request and vendor schemas", () => {
  it("requires exact integer line accounting and a non-related verified vendor", () => {
    expect(hedRequestDraftSchema.parse(request).amount).toBe("1000000");
    expect(hedRequestDraftSchema.safeParse({ ...request, amount: "999999" }).success).toBe(false);
    expect(hedRequestDraftSchema.safeParse({ ...request, deposit: "1000001" }).success).toBe(false);
    expect(hedVendorVerificationSchema.safeParse({ vendorWallet: `0x${"1".repeat(40)}`, legalName: "Nhà cung cấp A", contact: "contact@example.test",
      categories: ["GOODS"], relatedPartyDeclaration: true, validUntil: "2026-12-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("binds the frozen request to campaign, vendor verification and every approved term", () => {
    const campaign = `0x${"1".repeat(64)}`, report = `0x${"2".repeat(64)}`;
    expect(hedRequestHash(campaign, report, request)).not.toBe(hedRequestHash(campaign, report, { ...request, deposit: "0" }));
    expect(hedRequestHash(campaign, report, request)).not.toBe(hedRequestHash(campaign, `0x${"3".repeat(64)}`, request));
  });
});
