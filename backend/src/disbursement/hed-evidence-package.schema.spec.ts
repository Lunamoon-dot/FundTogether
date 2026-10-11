import { hedEvidencePackageSchema } from "./hed-evidence-package.schema";
const id = "11111111-1111-4111-8111-111111111111", hash = `0x${"1".repeat(64)}`;
describe("hedEvidencePackageSchema", () => {
  it("keeps delivery settlement and outcome proof distinct", () => {
    expect(hedEvidencePackageSchema.parse({ kind: "DELIVERY", requestDraftId: id, activityId: id, evidenceVersion: 1,
      publicDocumentId: id, acceptedValue: "0", documentIds: [id] }).kind).toBe("DELIVERY");
    expect(hedEvidencePackageSchema.safeParse({ kind: "OUTCOME", requestDraftId: id, activityId: id, evidenceVersion: 1,
      publicDocumentId: id, deliveredQuantity: 1, documentIds: [id] }).success).toBe(false);
  });
});
