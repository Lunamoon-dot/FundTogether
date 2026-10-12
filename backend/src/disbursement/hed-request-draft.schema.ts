import { z } from "zod";
import { keccak256, toHex } from "viem";

const tokenAmount = z.string().regex(/^[1-9][0-9]*$/);
const nonNegativeAmount = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const hedRequestDraftSchema = z.object({
  recipientWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  activityId: z.string().uuid(),
  purpose: z.string().trim().min(10).max(2_000),
  itemLines: z.array(z.object({ description: z.string().trim().min(2).max(500), quantity: z.number().int().positive().max(1_000_000),
    unitAmount: tokenAmount }).strict()).min(1).max(50),
  amount: tokenAmount,
  deposit: nonNegativeAmount.optional().default("0"),
  expectedDeliveryAt: z.iso.datetime({ offset: true }),
  acceptanceCriteria: z.array(z.string().trim().min(5).max(1_000)).min(1).max(20),
  terms: z.string().trim().min(10).max(10_000),
  needEvidenceReferences: z.array(z.string().uuid()).max(20),
}).strict().superRefine((value, context) => {
  if (value.deposit && BigInt(value.deposit) > BigInt(value.amount)) context.addIssue({ code: "custom", path: ["deposit"], message: "Deposit cannot exceed amount" });
  const total = value.itemLines.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitAmount), 0n);
  if (total !== BigInt(value.amount)) context.addIssue({ code: "custom", path: ["amount"], message: "Amount must equal item lines" });
});

export type HedRequestDraftInput = z.infer<typeof hedRequestDraftSchema>;

export const hedRequestHash = (campaignCommitmentHash: string, activityCommitmentHash: string, vendorReportHash: string, content: HedRequestDraftInput) => keccak256(toHex(JSON.stringify({
  version: "hed-mvp-1", campaignCommitmentHash, activityCommitmentHash, vendorReportHash: vendorReportHash || "0x0000000000000000000000000000000000000000000000000000000000000000", activityId: content.activityId,
  purpose: content.purpose, itemLines: content.itemLines, amount: content.amount, deposit: content.deposit ?? "0",
  expectedDeliveryAt: content.expectedDeliveryAt, acceptanceCriteria: content.acceptanceCriteria, terms: content.terms,
  needEvidenceReferences: content.needEvidenceReferences,
})));
