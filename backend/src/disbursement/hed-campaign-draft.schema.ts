import { z } from "zod";

const hexHash = z.string().regex(/^0x[0-9a-f]{64}$/);
const amount = z.string().superRefine((value, context) => {
  if (!/^[1-9]\d*$/.test(value)) { context.addIssue({ code: "custom", message: "Integer token amount required" }); return; }
  if (BigInt(value) > (1n << 255n) - 1n) context.addIssue({ code: "custom", message: "Amount too large" });
});

export const hedCampaignDraftSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(20).max(10_000),
  purpose: z.string().trim().min(10).max(2_000),
  beneficiaryScope: z.string().trim().min(10).max(2_000),
  allowedExpenseCategories: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
  outcomeCriteria: z.array(z.string().trim().min(5).max(1_000)).min(1).max(10),
  goal: amount,
  fundingDuration: z.number().int().min(86_400).max(2_592_000),
  policyHash: hexHash,
}).strict();

export type HedCampaignDraftInput = z.infer<typeof hedCampaignDraftSchema>;
