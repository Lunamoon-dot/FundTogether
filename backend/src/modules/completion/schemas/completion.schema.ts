import { z } from "zod";
import { digitalText } from "../../campaigns/schemas/campaign.schema";

export const completionRequestBodySchema = z.strictObject({
  title: z.string().trim().min(3).max(200),
  summary: digitalText(20, 2000),
  reason: digitalText(20, 5000),
});

export const completionDecisionBodySchema = z.strictObject({
  outcome: z.enum(["APPROVE", "CHANGES_REQUESTED", "REJECT"]),
  reason: digitalText(10, 3000),
});

export type CompletionRequestBody = z.infer<typeof completionRequestBodySchema>;
export type CompletionDecisionBody = z.infer<typeof completionDecisionBodySchema>;
