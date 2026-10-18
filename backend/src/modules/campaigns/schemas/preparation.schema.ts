import { z } from "zod";
import { createCampaignDraftSchema, digitalText, resolverReviewCampaignSchema } from "./campaign.schema";

export const campaignPreparationSchema = z.strictObject({
  payoutWalletLinkId: z.string().uuid(),
  sampleIds: z.array(z.string().uuid()).min(1).max(20)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate sample reference").transform(ids => [...ids].sort()),
  contentOutline: digitalText(20, 10000),
  budgetPlan: digitalText(20, 5000),
  evidencePlan: digitalText(20, 5000),
});
export const campaignUpdateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  config: createCampaignDraftSchema,
  preparation: campaignPreparationSchema,
});
export const campaignRevisionSchema = z.strictObject({ revision: z.number().int().nonnegative() });
export const campaignSubmitReviewSchema = campaignRevisionSchema.extend({
  responseBody: z.string().trim().min(10).max(3000).optional(),
  relatedFeedbackIds: z.array(z.string().uuid()).max(20)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate feedback reference")
    .default([]),
}).refine(input => !input.relatedFeedbackIds.length || Boolean(input.responseBody), "Feedback links require a Creator response");
export const campaignReviewThreadOpenSchema = z.strictObject({
  targetHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  body: z.string().trim().min(10).max(3000),
});
export const campaignReviewMessageSchema = z.strictObject({ body: z.string().trim().min(10).max(3000) });
export const campaignReviewThreadQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().trim().min(1).max(256).optional(),
});
export const campaignReviewEscalationSchema = z.strictObject({ reason: z.string().trim().min(10).max(3000) });
export const campaignReviewEscalationOutcomeSchema = z.strictObject({
  outcome: z.enum(["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"]),
  note: z.string().trim().min(10).max(3000),
});
export const campaignReviewSchema = resolverReviewCampaignSchema.extend({
  commitmentHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});
export type CampaignPreparation = z.infer<typeof campaignPreparationSchema>;
