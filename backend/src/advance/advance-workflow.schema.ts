import { z } from "zod";
import { uint256 } from "./advance-campaign.schema";
import { advanceEvidenceContextSchema } from "./advance-evidence.schema";
import { advanceReviewSchema } from "./advance-review.schema";
import { ADVANCE_STATES } from "./advance.types";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => !/^0x0+$/.test(v));
export const advanceCheckpointSchema = z.object({ blockNumber: uint256, blockHash: hash, chainTimestamp: uint256 }).strict();
export const advanceActionSchema = z.object({
  action: z.enum(["SUBMIT_CAMPAIGN", "APPROVE_CAMPAIGN", "PUBLISH_CAMPAIGN", "CANCEL_CAMPAIGN", "DONATE",
    "CONFIRM_FIRST_ADVANCE", "CLAIM_ADVANCE", "STOP_CAMPAIGN", "SUBMIT_EVIDENCE", "APPROVE_EVIDENCE",
    "REQUEST_SUPPLEMENT", "REJECT_EVIDENCE", "FINALIZE_STAGE", "RETURN_FUNDS", "OPEN_CASE", "ADD_CASE_MATERIAL",
    "SUBMIT_CASE_RESPONSE", "RESOLVE_CASE", "FINALIZE_TIMEOUT", "CLAIM_REFUND"]),
  context: advanceEvidenceContextSchema, actorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), expectedPlanHash: hash,
  expectedCheckpoint: advanceCheckpointSchema, expectedState: z.enum(["UNSUBMITTED", ...ADVANCE_STATES]), expectedCurrentStage: uint256,
  stage: uint256.optional(), amount: uint256.optional(), packageId: z.uuid().optional(),
  evidenceRef: z.object({ campaignId: uint256, stage: uint256, version: uint256.refine(v => v !== "0"), evidenceHash: hash }).strict().optional(),
  statement: z.object({ reason: z.string().trim().min(1).max(10000), sources: z.array(z.string().trim().min(1).max(1000)).min(1),
    limits: z.string().trim().min(1).max(10000), publicDisclosureConfirmed: z.literal(true) }).strict().optional(),
  review: advanceReviewSchema.optional(),
}).strict();
export type AdvanceActionInput = z.infer<typeof advanceActionSchema>;
