import { z } from "zod";
import { keccak256, toHex } from "viem";

const hash = z.string().regex(/^0x[0-9a-f]{64}$/).refine(value => !/^0x0{64}$/.test(value));
const id = z.string().uuid();

export const hedEvidencePackageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DELIVERY"), requestDraftId: id, activityId: id,
    evidenceVersion: z.number().int().positive().max(3), publicHash: hash,
    acceptedValue: z.string().regex(/^(0|[1-9][0-9]*)$/), documentIds: z.array(id).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("OUTCOME"), activityId: id,
    evidenceVersion: z.number().int().positive().max(3), publicHash: hash,
    deliveredQuantity: z.number().int().nonnegative(), documentIds: z.array(id).min(1).max(20) }).strict(),
]);

export type HedEvidencePackageInput = z.infer<typeof hedEvidencePackageSchema>;
export type HedEvidencePackage = HedEvidencePackageInput & { manifestHash: string };

export const hedEvidencePackageHash = (content: HedEvidencePackageInput, documents: { id: string; sha256: string }[]) => keccak256(toHex(JSON.stringify({
  version: "hed-mvp-1", kind: content.kind, activityId: content.activityId,
  requestDraftId: content.kind === "DELIVERY" ? content.requestDraftId : null,
  evidenceVersion: content.evidenceVersion, publicHash: content.publicHash,
  acceptedValue: content.kind === "DELIVERY" ? content.acceptedValue : null,
  deliveredQuantity: content.kind === "OUTCOME" ? content.deliveredQuantity : null,
  documents: documents.map(document => ({ id: document.id, sha256: document.sha256 })),
})));
