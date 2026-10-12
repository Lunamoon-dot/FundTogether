import { z } from "zod";

export const rewardTierInputSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(5).max(1000),
  price: z.string().regex(/^[1-9][0-9]*$/, "Price must be a positive integer in base units"),
  maxQuantity: z.number().int().positive().max(100000),
  isDigital: z.boolean().default(false),
  rewardItems: z.array(z.string().trim().min(1)).min(1),
  estimatedDeliveryAt: z.string().datetime().optional(),
});

export const createRewardCampaignDraftSchema = z.object({
  title: z.string().trim().min(5).max(200),
  pitch: z.string().trim().min(10).max(500),
  story: z.string().trim().min(20),
  category: z.enum(["COMICS", "ARTBOOK", "ILLUSTRATION", "OTHER"]).default("COMICS"),
  goal: z.string().regex(/^[1-9][0-9]*$/, "Goal must be a positive integer in base units"),
  fundingDuration: z.number().int().min(86400).max(5184000), // 1 day to 60 days
  policyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte hex hash"),
  tiers: z.array(rewardTierInputSchema).min(1).max(20),
});

export const registerRewardOnchainSchema = z.object({
  onchainCampaignId: z.string().regex(/^[0-9]+$/, "Onchain campaign ID must be numeric string"),
});

export const creatorVerificationInputSchema = z.object({
  displayName: z.string().trim().min(3).max(150),
  bio: z.string().trim().min(10).max(2000),
  ipDeclaration: z.string().trim().min(10).max(2000),
});

export const adminReviewCreatorSchema = z.object({
  outcome: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: z.string().max(1000).optional(),
});

export const resolverReviewCampaignSchema = z.object({
  outcome: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  decisionReason: z.string().trim().min(10).max(2000),
});

export type RewardTierInput = z.infer<typeof rewardTierInputSchema>;
export type CreateRewardCampaignDraftInput = z.infer<typeof createRewardCampaignDraftSchema>;
export type RegisterRewardOnchainInput = z.infer<typeof registerRewardOnchainSchema>;
export type CreatorVerificationInput = z.infer<typeof creatorVerificationInputSchema>;
export type AdminReviewCreatorInput = z.infer<typeof adminReviewCreatorSchema>;
export type ResolverReviewCampaignInput = z.infer<typeof resolverReviewCampaignSchema>;
