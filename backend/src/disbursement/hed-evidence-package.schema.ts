import { z } from "zod";

const hash = z.string().regex(/^0x[0-9a-f]{64}$/).refine(value => !/^0x0{64}$/.test(value));
const id = z.string().uuid();

export const hedEvidencePackageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DELIVERY"), requestDraftId: id, activityId: id,
    evidenceVersion: z.number().int().positive().max(3), manifestHash: hash, publicHash: hash,
    acceptedValue: z.string().regex(/^(0|[1-9][0-9]*)$/), documentIds: z.array(id).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("OUTCOME"), activityId: id,
    evidenceVersion: z.number().int().positive().max(3), manifestHash: hash, publicHash: hash,
    deliveredQuantity: z.number().int().nonnegative(), documentIds: z.array(id).min(1).max(20) }).strict(),
]);

export type HedEvidencePackageInput = z.infer<typeof hedEvidencePackageSchema>;
