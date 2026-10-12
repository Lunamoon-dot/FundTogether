import { z } from "zod";

export const notifyRewardPledgeSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const createRewardPledgeSchema = z.object({
  tierId: z.string().uuid("Invalid tier ID"),
  quantity: z.number().int().positive().max(100),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  backerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 20-byte Ethereum address"),
});

export const updateShippingAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  address: z.string().trim().min(5).max(500),
  phone: z.string().trim().min(8).max(20),
});

export const createFulfillmentBatchSchema = z.object({
  batchNumber: z.number().int().positive(),
  title: z.string().trim().min(3).max(150),
  carrier: z.string().trim().min(2).max(100),
  manifestHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte hex hash"),
  shippedItemCount: z.number().int().positive(),
  trackingCodes: z.record(z.string().uuid(), z.string().trim().min(1)), // entitlementId -> trackingCode
});

export const openRewardDisputeSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
  evidenceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export const resolveRewardDisputeSchema = z.object({
  outcome: z.enum(["RESOLVED_CREATOR", "RESOLVED_BACKER", "DISMISSED"]),
  resolutionNote: z.string().trim().min(5).max(2000),
});

export type NotifyRewardPledgeInput = z.infer<typeof notifyRewardPledgeSchema>;
export type CreateRewardPledgeInput = z.infer<typeof createRewardPledgeSchema>;
export type UpdateShippingAddressInput = z.infer<typeof updateShippingAddressSchema>;
export type CreateFulfillmentBatchInput = z.infer<typeof createFulfillmentBatchSchema>;
export type OpenRewardDisputeInput = z.infer<typeof openRewardDisputeSchema>;
export type ResolveRewardDisputeInput = z.infer<typeof resolveRewardDisputeSchema>;
