import { z } from "zod";
import { BadRequestException } from "@nestjs/common";

export function assertEmptyBody(body: unknown): void {
  if (!z.strictObject({}).optional().safeParse(body).success) {
    throw new BadRequestException("This operation accepts no payload fields");
  }
}

const amount = z.string().max(78).regex(/^[1-9][0-9]*$/, "Amount must be a positive integer in base units")
  .refine(value => /^[1-9][0-9]*$/.test(value) && value.length <= 78 && BigInt(value) <= 2n ** 256n - 1n, "Amount exceeds uint256");

// Conservative scope screening, not semantic or IP verification. Resolver review remains required.
const physicalPromise = /\b(physical|shipping|tracking|merch(?:andise)?|hardcover|paperback|printed|postcard|bookmark|sticker|redeem|collectible|limited campaign|sach in|ban in|vat ly|van chuyen|giao hang|doi hang|doi qua)\b/i;
export const digitalText = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
  return !physicalPromise.test(normalized);
}, "FundTogether Campaign supports PDF downloads only; remove physical or future-merch promises");

export const campaignTierInputSchema = z.strictObject({
  tierType: z.literal("STANDARD"),
  title: digitalText(3, 150),
  description: digitalText(5, 1000),
  price: amount,
  benefitItems: z.array(z.strictObject({
    type: z.literal("DIGITAL_DOWNLOAD"),
    format: z.literal("PDF"),
    title: digitalText(3, 150),
    description: digitalText(5, 1000),
  })).length(1),
});

export const createCampaignDraftSchema = z.strictObject({
  mode: z.literal("FUNDTOGETHER_V1"),
  policyVersion: z.literal("fundtogether-comic-download-mvp-v1"),
  title: digitalText(5, 200),
  pitch: digitalText(10, 500),
  story: digitalText(20, 20000),
  category: z.literal("COMICS_ARTBOOK"),
  goal: amount,
  fundingDuration: z.number().int().min(86400).max(5184000), // 1 day to 60 days
  tiers: z.array(campaignTierInputSchema).length(1),
});

export const registerCampaignOnchainSchema = z.strictObject({
  onchainCampaignId: z.string().regex(/^[0-9]+$/, "Onchain campaign ID must be numeric string"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash").optional(),
});

export const creatorVerificationInputSchema = z.strictObject({
  studioWalletLinkId: z.string().uuid().optional().nullable(),
  displayName: z.string().trim().min(3).max(150),
  bio: z.string().trim().min(10).max(2000),
  ipDeclaration: z.string().trim().min(10).max(2000),
  primaryGenre: z.string().trim().max(100).optional().nullable(),
  portfolioUrl: z.string().trim().max(500).optional().nullable(),
  socialUrl: z.string().trim().max(500).optional().nullable(),
  contactEmail: z.string().trim().max(255).optional().nullable(),
  originalWorkPledge: z.literal(true),
});


export const resolverVerifyProductionSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
  productionReportHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte hex hash").optional(),
});

export const resolverActivateCampaignSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const completeCampaignSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export const syncCampaignReceiptSchema = z.strictObject({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a 32-byte transaction hash"),
});

export type CampaignTierInput = z.infer<typeof campaignTierInputSchema>;
export type CreateCampaignDraftInput = z.infer<typeof createCampaignDraftSchema>;
export type RegisterCampaignOnchainInput = z.infer<typeof registerCampaignOnchainSchema>;
export type CreatorVerificationInput = z.infer<typeof creatorVerificationInputSchema>;
export type ResolverVerifyProductionInput = z.infer<typeof resolverVerifyProductionSchema>;
export type ResolverActivateCampaignInput = z.infer<typeof resolverActivateCampaignSchema>;
export type CompleteCampaignInput = z.infer<typeof completeCampaignSchema>;
export type SyncReceiptInput = z.infer<typeof syncCampaignReceiptSchema>;


