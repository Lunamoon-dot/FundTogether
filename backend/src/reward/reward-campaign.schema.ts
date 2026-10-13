import { z } from "zod";
import { BadRequestException } from "@nestjs/common";

export function assertEmptyRewardBody(body: unknown): void {
  if (!z.strictObject({}).optional().safeParse(body).success) {
    throw new BadRequestException("This operation accepts no payload fields");
  }
}

const amount = z.string().max(78).regex(/^[1-9][0-9]*$/, "Amount must be a positive integer in base units")
  .refine(value => /^[1-9][0-9]*$/.test(value) && value.length <= 78 && BigInt(value) <= 2n ** 256n - 1n, "Amount exceeds uint256");

// Conservative scope screening, not semantic or IP verification. Resolver review remains required.
const physicalPromise = /\b(physical|shipping|tracking|merch(?:andise)?|hardcover|paperback|printed|postcard|bookmark|sticker|redeem|collectible|limited edition|sach in|ban in|vat ly|van chuyen|giao hang|doi hang|doi qua)\b/i;
export const digitalText = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
  return !physicalPromise.test(normalized);
}, "FundTogether Editions supports PDF downloads only; remove physical or future-merch promises");

export const rewardTierInputSchema = z.strictObject({
  tierType: z.literal("STANDARD"),
  title: digitalText(3, 150),
  description: digitalText(5, 1000),
  price: amount,
  rewardItems: z.array(z.strictObject({
    type: z.literal("DIGITAL_DOWNLOAD"),
    format: z.literal("PDF"),
    title: digitalText(3, 150),
    description: digitalText(5, 1000),
  })).length(1),
  estimatedDeliveryAt: z.string().datetime().transform(value => new Date(value).toISOString()).optional(),
});

export const createRewardCampaignDraftSchema = z.strictObject({
  mode: z.literal("REWARD_V1"),
  policyVersion: z.literal("reward-comic-download-mvp-v1"),
  title: digitalText(5, 200),
  pitch: digitalText(10, 500),
  story: digitalText(20, 20000),
  category: z.literal("COMICS_ARTBOOK"),
  goal: amount,
  fundingDuration: z.number().int().min(86400).max(5184000), // 1 day to 60 days
  tiers: z.array(rewardTierInputSchema).length(1),
});

export const registerRewardOnchainSchema = z.strictObject({
  onchainCampaignId: z.string().regex(/^[0-9]+$/, "Onchain campaign ID must be numeric string"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash").optional(),
});

export const creatorVerificationInputSchema = z.strictObject({
  displayName: z.string().trim().min(3).max(150),
  bio: z.string().trim().min(10).max(2000),
  ipDeclaration: z.string().trim().min(10).max(2000),
});

export const adminReviewCreatorSchema = z.strictObject({
  outcome: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: z.string().max(1000).optional(),
});

export const resolverReviewCampaignSchema = z.strictObject({
  outcome: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  decisionReason: z.string().trim().min(10).max(2000),
});


export const resolverActivateCampaignSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const resolverVerifyProductionSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  productionReportHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte hex hash").optional(),
});

export const completeRewardCampaignSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const syncRewardReceiptSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export type RewardTierInput = z.infer<typeof rewardTierInputSchema>;
export type CreateRewardCampaignDraftInput = z.infer<typeof createRewardCampaignDraftSchema>;
export type RegisterRewardOnchainInput = z.infer<typeof registerRewardOnchainSchema>;
export type CreatorVerificationInput = z.infer<typeof creatorVerificationInputSchema>;
export type AdminReviewCreatorInput = z.infer<typeof adminReviewCreatorSchema>;
export type ResolverReviewCampaignInput = z.infer<typeof resolverReviewCampaignSchema>;
export type ResolverActivateCampaignInput = z.infer<typeof resolverActivateCampaignSchema>;
export type ResolverVerifyProductionInput = z.infer<typeof resolverVerifyProductionSchema>;
export type CompleteRewardCampaignInput = z.infer<typeof completeRewardCampaignSchema>;
export type SyncRewardReceiptInput = z.infer<typeof syncRewardReceiptSchema>;


