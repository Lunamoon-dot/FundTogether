import { z } from "zod";

export const notifyPledgeSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export const createPledgeSchema = z.strictObject({
  tierId: z.string().uuid("Invalid tier ID"),
  quantity: z.number().int().positive().max(100),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  backerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 20-byte Ethereum address"),
});

export const openDisputeSchema = z.strictObject({
  reason: z.string().trim().min(10).max(2000),
  evidenceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export const resolveDisputeSchema = z.strictObject({
  outcome: z.enum(["RESOLVED_CREATOR", "RESOLVED_BACKER", "DISMISSED"]),
  resolutionNote: z.string().trim().min(5).max(2000),
});

export const claimRefundSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  campaignId: z.string().uuid("Invalid campaign ID"),
});

export type NotifyPledgeInput = z.infer<typeof notifyPledgeSchema>;
export type CreatePledgeInput = z.infer<typeof createPledgeSchema>;
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type ClaimRefundInput = z.infer<typeof claimRefundSchema>;

