import { changedOrganizationFields, emptyOrganizationRequest, organizationDecisionSchema,
  organizationRequestContentSchema, submissionIssues } from "./organization-request.schema";

describe("organization request inputs", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const complete = () => ({ profile: { kind: "VOLUNTEER_GROUP" as const, legalName: "Group", registrationNumber: "", address: "Local",
    activityScope: "Food", representativeName: "Representative", representativeRole: "Coordinator", authorityBasis: "Member mandate",
    identitySource: "Local reference", activityEvidence: "Past distribution", contact: "Office" }, documentIds: [id], responseToReview: "" });
  it("allows incomplete drafts but reports concrete missing submission fields", () => {
    const draft = emptyOrganizationRequest("Group");
    expect(organizationRequestContentSchema.safeParse(draft).success).toBe(true);
    expect(submissionIssues(draft)).toContain("documents");
    expect(submissionIssues(draft)).toContain("authorityBasis");
    expect(submissionIssues(complete())).toEqual([]);
    expect(submissionIssues({ ...complete(), profile: { ...complete().profile, kind: "REGISTERED_ORGANIZATION" } })).toEqual(["registrationNumber"]);
  });
  it("rejects injected status, duplicate references and oversized fields", () => {
    for (const input of [{ ...complete(), status: "APPROVED" }, { ...complete(), documentIds: [id, id] },
      { ...complete(), profile: { ...complete().profile, legalName: "a".repeat(201) } }])
      expect(organizationRequestContentSchema.safeParse(input).success).toBe(false);
  });
  it("requires missing items for changes and a full verification assessment for approval", () => {
    expect(organizationDecisionSchema.safeParse({ expectedRevision: 1, decision: "REQUEST_CHANGES", reviewNote: "Missing authority", missingItems: ["Authority document"] }).success).toBe(true);
    for (const input of [{ expectedRevision: 1, decision: "REQUEST_CHANGES", reviewNote: "Missing", missingItems: [] },
      { expectedRevision: 1, decision: "APPROVE", reviewNote: "OK" }, { expectedRevision: 1, decision: "REJECT", reviewNote: "" }])
      expect(organizationDecisionSchema.safeParse(input).success).toBe(false);
  });
  it("audit field names are derived without logging sensitive values or array reorder", () => {
    const before = complete();
    expect(changedOrganizationFields(before, { ...before, profile: { ...before.profile, contact: "private@example.invalid" } })).toEqual(["profile.contact"]);
    expect(changedOrganizationFields(before, { ...before, responseToReview: "Updated" })).toEqual(["responseToReview"]);
    expect(changedOrganizationFields(before, { ...before, documentIds: [] })).toEqual(["documents"]);
  });
});
