import { z } from "zod";

const amount = z.string().regex(/^[1-9][0-9]*$/);

export const hedActivitySchema = z.object({
  title: z.string().trim().min(3).max(200),
  beneficiaryScope: z.string().trim().min(10).max(2_000),
  targetQuantity: z.number().int().positive().max(1_000_000),
  outcomeCriteria: z.array(z.string().trim().min(5).max(1_000)).min(1).max(10),
  ceiling: amount,
  deliveryDeadline: z.iso.datetime({ offset: true }),
  outcomeDeadline: z.iso.datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.outcomeDeadline) <= Date.parse(value.deliveryDeadline)) context.addIssue({ code: "custom", path: ["outcomeDeadline"], message: "Outcome deadline must follow delivery deadline" });
});

export type HedActivityInput = z.infer<typeof hedActivitySchema>;
