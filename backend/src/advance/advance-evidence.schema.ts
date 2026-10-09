import { z } from "zod";
import { evidenceDraftContentSchema } from "../modules/evidence/evidence.schema";
import { uint256 } from "./advance-campaign.schema";

const digest = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => !/^0x0+$/.test(v));
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const text = z.string().trim().min(1).max(10000);
export const advanceEvidenceContextSchema = z.object({ protocolKind: z.literal("ADVANCE"), chainId: z.literal(31338),
  deploymentId: digest, contractAddress: address, tokenAddress: address, resolver: address,
  workflowPolicy: digest, abiVersion: z.literal("1"), confirmations: z.literal(1) }).strict();
const giftReport = z.object({ deliveredPackages: z.number().int().nonnegative(), recipientScope: text,
  distributionFrom: z.iso.date(), distributionTo: z.iso.date(), handoverSummary: text, limitations: text }).strict()
  .refine(v => v.distributionFrom <= v.distributionTo, "Invalid distribution dates");
export const advanceEvidenceContentSchema = evidenceDraftContentSchema.safeExtend({ giftReport }).superRefine((v, ctx) => {
  if (v.documents.length > 20 || v.documents.some(d => d.byteSize > 10 * 1024 * 1024
    || d.visibility !== "RESTRICTED_ORIGINAL" || d.storageObjectId !== d.documentId))
    ctx.addIssue({ code: "custom", message: "At most 20 restricted original files, 10 MiB each, with matching object IDs" });
});
export const advanceEvidencePackageSchema = advanceEvidenceContentSchema.safeExtend({
  schemaVersion: z.literal("0.2"), packageId: z.string().uuid(), context: advanceEvidenceContextSchema,
  campaignMetadataId: z.string().uuid(), campaignId: uint256, milestoneIndex: uint256,
  submissionVersion: z.number().int().min(1).max(3), organizerAddress: address, planHash: digest,
  criteriaHash: digest, channel: z.enum(["DIRECT", "INSTITUTION"]), checklistVersion: z.literal("gift.v1"),
  parentPackageId: z.string().uuid().nullable(), createdAt: z.iso.datetime({ offset: true }),
});
export const advancePublicManifestSchema = z.object({ schemaVersion: z.literal("advance.public.v1"),
  context: advanceEvidenceContextSchema, packageId: z.string().uuid(), evidenceHash: digest, planHash: digest,
  criteriaHash: digest, campaignId: uint256, milestoneIndex: uint256, submissionVersion: z.number().int().min(1).max(3),
  summary: text, redactionConfirmed: z.literal(true),
  documents: z.array(z.object({ documentId: z.string().uuid(), originalDocumentId: text, originalSha256: digest,
    storageObjectId: text, mediaType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024), sha256: digest }).strict()).min(1).max(20),
}).strict();
export type AdvanceEvidenceContent = z.infer<typeof advanceEvidenceContentSchema>;
export type AdvanceEvidencePackage = z.infer<typeof advanceEvidencePackageSchema>;
