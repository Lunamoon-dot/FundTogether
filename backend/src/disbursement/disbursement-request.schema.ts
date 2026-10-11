import { z } from "zod";

const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/).refine(value => !/^0x0{64}$/.test(value));
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const tokenAmount = z.string().regex(/^[1-9][0-9]*$/);

export const submitDisbursementRequestSchema = z.object({
  campaignMetadataId: z.string().uuid(),
  requestHash: hex32,
  vendorWallet: address,
  amount: tokenAmount,
  deposit: z.string().regex(/^(0|[1-9][0-9]*)$/),
}).superRefine((value, context) => {
  if (/^[1-9][0-9]*$/.test(value.amount) && /^(0|[1-9][0-9]*)$/.test(value.deposit)
    && BigInt(value.deposit) > BigInt(value.amount)) {
    context.addIssue({ code: "custom", path: ["deposit"], message: "Deposit cannot exceed request amount" });
  }
});
