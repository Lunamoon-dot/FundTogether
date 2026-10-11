import { hedEvidencePackageHash } from "./hed-evidence-package.schema";

const input = { kind: "DELIVERY" as const, requestDraftId: "11111111-1111-4111-8111-111111111111",
  activityId: "22222222-2222-4222-8222-222222222222", evidenceVersion: 1,
  publicHash: `0x${"1".repeat(64)}`, acceptedValue: "100", documentIds: ["33333333-3333-4333-8333-333333333333"] };

describe("hedEvidencePackageHash", () => {
  it("commits server-owned document hashes and the public bundle", () => {
    const original = hedEvidencePackageHash(input, [{ id: input.documentIds[0], sha256: `0x${"2".repeat(64)}` }]);
    expect(hedEvidencePackageHash(input, [{ id: input.documentIds[0], sha256: `0x${"2".repeat(64)}` }])).toBe(original);
    expect(hedEvidencePackageHash(input, [{ id: input.documentIds[0], sha256: `0x${"3".repeat(64)}` }])).not.toBe(original);
    expect(hedEvidencePackageHash({ ...input, publicHash: `0x${"4".repeat(64)}` }, [{ id: input.documentIds[0], sha256: `0x${"2".repeat(64)}` }])).not.toBe(original);
  });
});
