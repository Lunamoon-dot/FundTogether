import { z } from "zod";

const hash = z.string().regex(/^0x[0-9a-f]{64}$/).refine(value => !/^0x0{64}$/.test(value));
const criterion = z.string().regex(/^(NEED|DEL|OUT)-0[1-6]$/);

export const hedReviewSchema = z.object({
  evidenceVersion: z.number().int().positive().max(3),
  criterionId: criterion,
  outcome: z.enum(["MET", "NOT_MET", "NEEDS_INFO"]),
  reasonCode: z.string().trim().min(3).max(64),
  reason: z.string().trim().min(10).max(10_000),
  manifestHash: hash,
  publicHash: hash.optional(),
  sourceReferences: z.array(z.string().uuid()).min(1).max(20),
}).strict().superRefine((value, context) => {
  if (value.outcome === "MET" && !value.publicHash) context.addIssue({ code: "custom", path: ["publicHash"], message: "MET requires a redacted public bundle hash" });
});

export type HedReviewInput = z.infer<typeof hedReviewSchema>;
