import { z } from "zod";

const text = z.string().trim().min(1).max(10000);
const key = z.string().trim().min(1).max(128);
export const uint256 = z.string().regex(/^(0|[1-9]\d{0,77})$/)
  .refine(value => /^(0|[1-9]\d{0,77})$/.test(value) && BigInt(value) <= (1n << 256n) - 1n, "Exceeds uint256");
const positive = uint256.refine(value => value !== "0", "Amount must be positive");
const documentKind = z.enum(["REPORT", "INVOICE", "RECEIPT", "PAYMENT_PROOF", "DELIVERY_RECORD", "PHOTO", "OTHER"]);
const criterion = z.object({ criterionId: key, description: text, requiredDocuments: z.array(documentKind).min(1) }).strict();
const task = z.object({ taskId: key, description: text, criterionIds: z.array(key).min(1) }).strict();
const stage = z.object({
  title: z.string().trim().min(1).max(200), description: text, budgetUnits: positive,
  targetPackages: z.number().int().positive().max(2147483647), goods: text,
  tasks: z.array(task).min(1), acceptanceCriteria: z.array(criterion).min(1),
}).strict().superRefine((value, ctx) => {
  const criteria = new Set(value.acceptanceCriteria.map(c => c.criterionId));
  if (criteria.size !== value.acceptanceCriteria.length || new Set(value.tasks.map(t => t.taskId)).size !== value.tasks.length)
    ctx.addIssue({ code: "custom", message: "Task and criterion IDs must be unique within a stage" });
  if (value.tasks.some(t => t.criterionIds.some(id => !criteria.has(id)) || new Set(t.criterionIds).size !== t.criterionIds.length))
    ctx.addIssue({ code: "custom", message: "Task references must match unique stage criterion IDs" });
});
const fields = {
  activityType: z.literal("GIFT_DISTRIBUTION"), channel: z.enum(["DIRECT", "INSTITUTION"]),
  checklistVersion: z.literal("gift.v1"), title: z.string().trim().min(1).max(200), description: text,
  recipientScope: text, eligibilityBasis: text,
  fundingDuration: uint256.refine(value => /^(0|[1-9]\d{0,77})$/.test(value)
    && BigInt(value) >= 86400n && BigInt(value) <= 2592000n, "Funding duration must be1–30 days"),
  stages: z.array(stage).min(1),
};
const validGoal = (value: { stages: { budgetUnits: string }[] }) => value.stages.reduce((sum, s) =>
  sum + (/^[1-9]\d{0,77}$/.test(s.budgetUnits) ? BigInt(s.budgetUnits) : 0n), 0n) <= (1n << 256n) - 1n;
export const giftDraftSchema = z.object(fields).strict().refine(validGoal, { message: "Goal exceeds uint256", path: ["stages"] });
export const giftUpdateSchema = giftDraftSchema.safeExtend({
  expectedRevision: z.number().int().min(1).max(2147483646),
  stages: z.array(stage.safeExtend({ id: z.string().uuid().optional() })).min(1),
}).refine(value => {
  const ids = value.stages.flatMap(s => s.id ? [s.id] : []);
  return ids.length === new Set(ids).size;
}, { message: "Milestone IDs must be unique", path: ["stages"] });
export const submissionRevisionSchema = z.object({ expectedRevision: z.number().int().min(1).max(2147483646) }).strict();
export const goalUnits = (input: { stages: { budgetUnits: string }[] }) => input.stages.reduce((sum, s) => sum + BigInt(s.budgetUnits), 0n).toString();
export type GiftDraft = z.infer<typeof giftDraftSchema>;
export type GiftUpdate = z.infer<typeof giftUpdateSchema>;
