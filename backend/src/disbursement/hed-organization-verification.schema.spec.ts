import { hedOrganizationVerificationContentSchema, hedOrganizationVerificationDecisionSchema } from "./hed-organization-verification.schema";

const content = { legalName: "Quỹ HED", registrationNumber: "VN-123", contactName: "Nguyen Van A", contactEmail: "a@example.com", address: "1 Duong HED, Ho Chi Minh", activitySummary: "To chuc hoat dong mua hang va trao qua co kiem chung.", declaration: true as const };

describe("HED organization verification schema", () => {
  it("requires a complete signed declaration", () => {
    expect(hedOrganizationVerificationContentSchema.safeParse(content).success).toBe(true);
    expect(hedOrganizationVerificationContentSchema.safeParse({ ...content, declaration: false }).success).toBe(false);
  });

  it("requires an expiry only for approval", () => {
    expect(hedOrganizationVerificationDecisionSchema.safeParse({ decision: "APPROVE", note: "Hồ sơ hợp lệ" }).success).toBe(false);
    expect(hedOrganizationVerificationDecisionSchema.safeParse({ decision: "REQUEST_CHANGES", note: "Bổ sung giấy phép", validUntil: "2027-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(hedOrganizationVerificationDecisionSchema.safeParse({ decision: "APPROVE", note: "Hồ sơ hợp lệ", validUntil: "2027-01-01T00:00:00.000Z" }).success).toBe(true);
  });
});
