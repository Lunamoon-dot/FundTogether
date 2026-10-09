import { ForbiddenException } from "@nestjs/common";
import { OrganizationVerificationService } from "./organization-verification.service";
import { organizationVerificationSchema, validateCriterionDecision, validateCriterionDocuments } from "./advance-review.schema";

describe("staff verification and substantive decision policy", () => {
  const input = { status: "VERIFIED", summary: "Synthetic organization check", reason: "Verified controlled authority",
    sources: [{ description: "Controlled registry", reference: "synthetic-registry-1" }],
    scope: "Campaign authority only", limits: "Cannot guarantee future execution", validUntil: "2027-01-01T00:00:00Z" };
  it("requires status, sources, reason, scope, limits and explicit validity", () => {
    expect(organizationVerificationSchema.safeParse(input).success).toBe(true);
    for (const change of [{ reason: "" }, { sources: [] }, { validUntil: "invalid" }, { scope: "" }, { status: "OTHER" }])
      expect(organizationVerificationSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("non-ADMIN cannot create verification and nothing is written", async () => {
    const q: Record<string, unknown> = {};
    for (const method of ["from", "where", "for", "limit"]) q[method] = () => q;
    q.then = (resolve: (rows: { roles: string[] }[]) => unknown) => resolve([{ roles: ["RESOLVER"] }]);
    const tx = { select: () => q, insert: jest.fn() };
    const db = { transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new OrganizationVerificationService(db as never, {} as never);
    await expect(service.record("org", "user", input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it("verification queue and history recheck current account roles", async () => {
    const query = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const method of ["from", "where", "orderBy"]) q[method] = () => q;
      q.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
      return q;
    };
    let roles: string[] = [], selects = 0;
    const db = { select: () => { selects++; return query(selects % 2 === 1 ? [{ roles }] : []); } };
    const service = new OrganizationVerificationService(db as never, {} as never);
    await expect(service.queue("user")).rejects.toBeInstanceOf(ForbiddenException);
    selects = 0;
    await expect(service.history("org", "user")).rejects.toBeInstanceOf(ForbiddenException);
    roles = ["RESOLVER"]; selects = 0;
    await expect(service.queue("user")).rejects.toBeInstanceOf(ForbiddenException);
    selects = 0;
    await expect(service.history("org", "user")).resolves.toEqual([]);
    roles = ["ADMIN"]; selects = 0;
    await expect(service.queue("user")).resolves.toEqual([]);
  });
  it("MET requires every frozen criterion, evidence references, rationale, sources and declared conflict clearance", () => {
    const criteria = [{ criterionId: "C1" }, { criterionId: "C2" }];
    const decision = { outcome: "MET", conflictOfInterest: false, campaignSpent: "1100000000",
      criteria: criteria.map(c => ({ criterionId: c.criterionId, outcome: "MET", reason: "Source checked",
        documentIds: ["doc-1"], sources: ["controlled registry"], limits: "Synthetic input" })) };
    expect(() => validateCriterionDecision(criteria, decision, "1100000000")).not.toThrow();
    for (const delta of [{ criteria: decision.criteria.slice(0, 1) },
      { criteria: [decision.criteria[0], decision.criteria[0]] }, { conflictOfInterest: true },
      { campaignSpent: "1100000001" }, { criteria: decision.criteria.map(c => ({ ...c, outcome: "INCONCLUSIVE" })) },
      { criteria: decision.criteria.map(c => ({ ...c, documentIds: [] })) }]) {
      expect(() => validateCriterionDecision(criteria, { ...decision, ...delta }, "1100000000")).toThrow();
    }
  });
  it("a MET criterion cannot replace required invoice/payment evidence with an unrelated report", () => {
    const criteria = [{ criterionId: "C1", requiredDocuments: ["INVOICE", "PAYMENT_PROOF"] }];
    const decision = validateCriterionDecision(criteria, { outcome: "MET", campaignSpent: "1", conflictOfInterest: false,
      criteria: [{ criterionId: "C1", outcome: "MET", reason: "Checked", documentIds: ["invoice", "payment"],
        sources: ["registry"], limits: "Synthetic" }] }, "1");
    const documents = [{ documentId: "invoice", kind: "INVOICE", relatesToCriterionIds: ["C1"] },
      { documentId: "payment", kind: "PAYMENT_PROOF", relatesToCriterionIds: ["C1"] }];
    expect(() => validateCriterionDocuments(criteria, decision, documents)).not.toThrow();
    expect(() => validateCriterionDocuments(criteria, decision, [documents[0], { ...documents[1], kind: "REPORT" }])).toThrow();
    expect(() => validateCriterionDocuments(criteria, decision, [documents[0], { ...documents[1], relatesToCriterionIds: [] }])).toThrow();
  });
});
