import { z } from "zod";

const wallet = z.string().regex(/^0x[0-9a-f]{40}$/).refine(value => !/^0x0{40}$/.test(value));

export const hedVendorVerificationSchema = z.object({
  vendorWallet: wallet,
  legalName: z.string().trim().min(2).max(200),
  contact: z.string().trim().min(3).max(200),
  categories: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
  relatedPartyDeclaration: z.literal(false),
  validUntil: z.iso.datetime({ offset: true }),
}).strict();

export type HedVendorVerificationInput = z.infer<typeof hedVendorVerificationSchema>;
