import { z } from "zod";
import { createRewardCampaignDraftSchema, digitalText, resolverReviewCampaignSchema } from "./reward-campaign.schema";

const instant = z.string().datetime().refine(value => new Date(value).getTime() % 1000 === 0, "Use whole-second release times")
  .transform(value => new Date(value).toISOString());
export const editionsPreparationSchema = z.strictObject({
  payoutWalletLinkId: z.string().uuid(),
  sampleIds: z.array(z.string().uuid()).min(1).max(20)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate sample reference").transform(ids => [...ids].sort()),
  contentOutline: digitalText(20, 10000),
  budgetPlan: digitalText(20, 5000),
  evidencePlan: digitalText(20, 5000),
  releaseWindow: z.strictObject({ start: instant, end: instant })
    .refine(window => window.start <= window.end, "Release window must be ordered"),
});
export const editionsUpdateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  config: createRewardCampaignDraftSchema,
  preparation: editionsPreparationSchema,
}).refine(({ config, preparation }) => {
  const estimate = config.tiers[0].estimatedDeliveryAt;
  return !estimate || new Date(estimate).toISOString() <= preparation.releaseWindow.end;
}, "Estimated delivery must be on or before the committed release deadline");
export const editionsRevisionSchema = z.strictObject({ revision: z.number().int().nonnegative() });
export const editionsSubmitReviewSchema = editionsRevisionSchema.extend({
  responseBody: z.string().trim().min(10).max(3000).optional(),
  relatedFeedbackIds: z.array(z.string().uuid()).max(20)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate feedback reference")
    .default([]),
}).refine(input => !input.relatedFeedbackIds.length || Boolean(input.responseBody), "Feedback links require a Creator response");
export const editionsReviewThreadOpenSchema = z.strictObject({
  targetHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  body: z.string().trim().min(10).max(3000),
});
export const editionsReviewMessageSchema = z.strictObject({ body: z.string().trim().min(10).max(3000) });
export const editionsReviewEscalationSchema = z.strictObject({ reason: z.string().trim().min(10).max(3000) });
export const editionsReviewEscalationOutcomeSchema = z.strictObject({
  outcome: z.enum(["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"]),
  note: z.string().trim().min(10).max(3000),
});
export const editionsReviewSchema = resolverReviewCampaignSchema.extend({
  commitmentHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});
export type EditionsPreparation = z.infer<typeof editionsPreparationSchema>;
