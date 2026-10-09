import { z } from "zod";
import { BadRequestException } from "@nestjs/common";
import { uint256 } from "./advance-campaign.schema";

const text = z.string().trim().min(1).max(10000);
const digest = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => !/^0x0+$/.test(v));
const source = z.object({ description: text, reference: text }).strict();
export const organizationVerificationSchema = z.object({
  status: z.enum(["VERIFIED", "REVOKED"]), summary: text, reason: text,
  sources: z.array(source).min(1), scope: text, limits: text, validUntil: z.iso.datetime({ offset: true }),
}).strict();
export type OrganizationVerificationInput = z.infer<typeof organizationVerificationSchema>;

export const criterionDecisionSchema = z.object({
  outcome: z.enum(["MET", "NEEDS_INFORMATION", "NOT_MET", "INCONCLUSIVE"]),
  conflictOfInterest: z.boolean().refine(value => !value, "Resolve conflict before reviewing"),
  campaignSpent: uint256,
  criteria: z.array(z.object({ criterionId: text, outcome: z.enum(["MET", "NEEDS_INFORMATION", "NOT_MET", "INCONCLUSIVE"]),
    reason: text, documentIds: z.array(text), sources: z.array(text).min(1), limits: text }).strict()).min(1),
}).strict();
export type CriterionDecision = z.infer<typeof criterionDecisionSchema>;

export const advanceReviewSchema = z.object({
  kind: z.enum(["APPROVE_CAMPAIGN", "FIRST_ELIGIBILITY", "EVIDENCE", "CASE", "STOP"]),
  actorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), expectedPlanHash: digest,
  reason: text, sources: z.array(source).min(1), scope: text, limits: text,
  conflictOfInterest: z.boolean().refine(value => !value),
  publicDisclosureConfirmed: z.literal(true),
  evidenceRef: z.object({ campaignId: uint256, stage: uint256, version: uint256.refine(v => v !== "0"), evidenceHash: digest }).strict().optional(),
  packageId: z.string().uuid().optional(), publicHash: digest.optional(),
  decision: criterionDecisionSchema.optional(), resolution: z.enum(["CONTINUE", "RESUBMIT", "STOP"]).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "EVIDENCE" && (!value.evidenceRef || !value.packageId || !value.decision))
    ctx.addIssue({ code: "custom", message: "Evidence review requires exact ref/package and criterion decision" });
  if (value.kind === "EVIDENCE" && value.decision?.outcome === "MET" && !value.publicHash)
    ctx.addIssue({ code: "custom", message: "MET requires public bundle hash" });
  if (value.kind === "CASE" && (!value.evidenceRef || !value.resolution))
    ctx.addIssue({ code: "custom", message: "Case decision requires exact ref and outcome" });
});
export type AdvanceReviewInput = z.infer<typeof advanceReviewSchema>;

export function validateCriterionDecision(criteria: { criterionId: string }[], input: unknown, budget: string): CriterionDecision {
  const result = criterionDecisionSchema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  const decision = result.data;
  const ids = new Set(decision.criteria.map(c => c.criterionId));
  if (ids.size !== decision.criteria.length || ids.size !== criteria.length || criteria.some(c => !ids.has(c.criterionId)))
    throw new BadRequestException("Decision must cover each frozen criterion exactly once");
  if (BigInt(decision.campaignSpent) > BigInt(budget)) throw new BadRequestException("Campaign spending exceeds stage budget; separate organizer funding");
  if (decision.outcome === "MET" && decision.criteria.some(c => c.outcome !== "MET" || c.documentIds.length === 0))
    throw new BadRequestException("MET requires every criterion met with referenced evidence");
  if (decision.outcome === "NOT_MET" && !decision.criteria.some(c => c.outcome === "NOT_MET"))
    throw new BadRequestException("NOT_MET requires a failed criterion");
  if (decision.outcome === "NEEDS_INFORMATION" && !decision.criteria.some(c => c.outcome === "NEEDS_INFORMATION"))
    throw new BadRequestException("Supplement requires a missing-information criterion");
  if (decision.outcome === "INCONCLUSIVE" && !decision.criteria.some(c => c.outcome === "INCONCLUSIVE"))
    throw new BadRequestException("INCONCLUSIVE requires an unresolved criterion");
  return decision;
}

export function validateCriterionDocuments(criteria: { criterionId: string; requiredDocuments: string[] }[], decision: CriterionDecision,
  documents: { documentId: string; kind: string; relatesToCriterionIds: string[] }[]) {
  const docs = new Map(documents.map(d => [d.documentId, d]));
  for (const assessment of decision.criteria) {
    const selected = assessment.documentIds.map(id => docs.get(id));
    if (selected.some(d => !d || !d.relatesToCriterionIds.includes(assessment.criterionId)))
      throw new BadRequestException("Criterion references must name its documents in this exact package");
    if (assessment.outcome === "MET") {
      const criterion = criteria.find(c => c.criterionId === assessment.criterionId)!;
      if (criterion.requiredDocuments.some(kind => !selected.some(d => d?.kind === kind)))
        throw new BadRequestException("MET criterion is missing a required document kind");
    }
  }
}
