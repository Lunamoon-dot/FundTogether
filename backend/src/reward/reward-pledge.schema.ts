import { z } from "zod";

export const notifyRewardPledgeSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const createRewardPledgeSchema = z.strictObject({
  tierId: z.string().uuid("Invalid tier ID"),
  quantity: z.number().int().positive().max(100),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  backerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 20-byte Ethereum address"),
});

export const openRewardDisputeSchema = z.strictObject({
  reason: z.string().trim().min(10).max(2000),
  evidenceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export const resolveRewardDisputeSchema = z.strictObject({
  outcome: z.enum(["RESOLVED_CREATOR", "RESOLVED_BACKER", "DISMISSED"]),
  resolutionNote: z.string().trim().min(5).max(2000),
});

export const claimRewardRefundSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export type NotifyRewardPledgeInput = z.infer<typeof notifyRewardPledgeSchema>;
export type CreateRewardPledgeInput = z.infer<typeof createRewardPledgeSchema>;
export type OpenRewardDisputeInput = z.infer<typeof openRewardDisputeSchema>;
export type ResolveRewardDisputeInput = z.infer<typeof resolveRewardDisputeSchema>;
export type ClaimRewardRefundInput = z.infer<typeof claimRewardRefundSchema>;

