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
  return !estimate || (new Date(estimate).toISOString() >= preparation.releaseWindow.start && new Date(estimate).toISOString() <= preparation.releaseWindow.end);
}, "Estimated delivery must be within the release window");
export const editionsRevisionSchema = z.strictObject({ revision: z.number().int().nonnegative() });
export const editionsReviewSchema = resolverReviewCampaignSchema.extend({
  commitmentHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});
export type EditionsPreparation = z.infer<typeof editionsPreparationSchema>;
