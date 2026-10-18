import { z } from "zod";
import { digitalText } from "../../campaigns/schemas/campaign.schema";

export const payoutRequestBodySchema = z.strictObject({
  amount: z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => BigInt(value) > 0n, "Amount must be a positive integer"),
  title: z.string().trim().min(3).max(200),
  summary: digitalText(20, 2000),
  reason: digitalText(20, 5000),
  breakdown: digitalText(10, 3000),
});

export const payoutDecisionBodySchema = z.strictObject({
  outcome: z.enum(["APPROVE", "CHANGES_REQUESTED", "REJECT"]),
  reason: digitalText(10, 3000),
});

export type PayoutRequestBody = z.infer<typeof payoutRequestBodySchema>;
export type PayoutDecisionBody = z.infer<typeof payoutDecisionBodySchema>;
