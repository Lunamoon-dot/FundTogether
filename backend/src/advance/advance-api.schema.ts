import { z } from "zod";
import { ADVANCE_STATES, CASE_RESOLUTIONS, REVIEW_OUTCOMES, STAGE_STATES } from "./advance.types";
import { giftDraftSchema, giftUpdateSchema, uint256 } from "./advance-campaign.schema";
import { advanceEvidenceContextSchema, advanceEvidenceContentSchema } from "./advance-evidence.schema";
import { advanceCheckpointSchema } from "./advance-workflow.schema";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/), address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const nullableText = z.string().nullable(), uuid = z.uuid();
export const advanceSubmissionPlanSchema = z.object({ context: advanceEvidenceContextSchema, draftKey: hash, organizer: address,
  planHash: hash, planBytes: z.string(), fundingDuration: uint256, budgets: z.array(uint256), criteriaHashes: z.array(hash), expectedRevision: z.number().int().positive() });
const campaign = z.object({ organizer: address, planHash: hash, goal: uint256, fundingDuration: uint256, state: z.enum(ADVANCE_STATES),
  currentStage: uint256, fundingEnd: uint256, firstReviewEnd: uint256, claimEnd: uint256, contributed: uint256, advanced: uint256,
  returned: uint256, refunded: uint256, custody: uint256, refundSnapshotted: z.boolean(), basePool: uint256, supplementPool: uint256 });
const challengeCase = z.object({ opener: address, reasonHash: hash, responseHash: hash, responseEnd: uint256, resolutionEnd: uint256,
  resolution: z.enum(CASE_RESOLUTIONS), resolutionReasonHash: hash, caseUsed: z.boolean() });
const submission = z.object({ version: uint256, evidenceHash: hash, parentVersion: uint256, submittedAt: uint256,
  reviewed: z.boolean(), outcome: z.enum(REVIEW_OUTCOMES).nullable(), reportHash: hash, publicHash: hash, challengeCase });
const stage = z.object({ budget: uint256, criteriaHash: hash, state: z.enum(STAGE_STATES), advanced: uint256, returned: uint256,
  latestVersion: uint256, hardStop: uint256, submissionEnd: uint256, reviewEnd: uint256, challengeEnd: uint256, finalizeEnd: uint256,
  acceptedCampaignSpent: uint256, declaredUnused: uint256, publicHash: hash, reportHash: hash, submissions: z.array(submission) });
export const advanceSnapshotSchema = z.object({ context: advanceEvidenceContextSchema, checkpoint: advanceCheckpointSchema,
  campaignId: uint256, campaign, stages: z.array(stage), published: z.boolean(), publicationTransactionHash: hash.nullable() });
export const advanceWorkflowSchema = z.object({ context: advanceEvidenceContextSchema, checkpoint: advanceCheckpointSchema,
  campaignId: uint256, currentStage: uint256, state: z.enum(ADVANCE_STATES), stageState: z.enum(STAGE_STATES), goal: uint256,
  contributed: uint256, advanced: uint256, returned: uint256, refunded: uint256, custody: uint256, basePool: uint256, supplementPool: uint256,
  deadlines: z.object({ fundingEnd: uint256, firstReviewEnd: uint256, claimEnd: uint256, submissionEnd: uint256, reviewEnd: uint256,
    challengeEnd: uint256, responseEnd: uint256, resolutionEnd: uint256, finalizeEnd: uint256, hardStop: uint256 }) });
export const advanceActionPreparationSchema = z.object({ context: advanceEvidenceContextSchema, checkpoint: advanceCheckpointSchema,
  actorWallet: address, contractAddress: address, functionName: z.string(), args: z.array(z.unknown()), recordHash: hash.nullable(),
  blockedReason: z.string().nullable(), approval: z.object({ tokenAddress: address, spender: address, amount: uint256, allowance: uint256 }).optional() });
const campaignFields = { id: uuid, organizationId: uuid.nullable(), organizerUserId: uuid.nullable(), createdByUserId: uuid.nullable(),
  title: z.string(), description: nullableText, status: z.string(), revision: z.number().int(), chainId: nullableText,
  contractAddress: nullableText, onchainCampaignId: nullableText, createdAt: z.string(), updatedAt: z.string() };
export const advanceDraftSchema = z.object({ ...campaignFields, content: giftDraftSchema.safeExtend({ stages: giftUpdateSchema.shape.stages }),
  goalUnits: uint256, frozen: z.boolean(), submissionPlan: advanceSubmissionPlanSchema.nullable() });
export const advanceDraftListSchema = z.array(z.object({ id: uuid, title: z.string(), revision: z.number().int(), status: z.string(),
  createdAt: z.string(), frozenAt: z.string().nullable() }));
export const advanceIndexerStatusSchema = z.object({ status: z.enum(["syncing", "ready", "error", "rebuilding"]),
  lastIndexedBlock: uint256.nullable(), lastIndexedBlockHash: hash.nullable(), headBlock: uint256.nullable(), chainTimestamp: uint256.nullable(), error: nullableText });
export const advancePackageSummarySchema = z.object({ id: uuid, milestoneIndex: uint256, submissionVersion: z.number().int(),
  draftRevision: z.number().int(), evidenceHash: hash });
export const advanceOwnerWorkflowSchema = z.object({ metadataId: uuid, organizationId: uuid, title: z.string(), plan: advanceSubmissionPlanSchema,
  snapshot: advanceSnapshotSchema.nullable(), workflow: advanceWorkflowSchema.nullable(), packages: z.array(advancePackageSummarySchema),
  reviewAccess: z.object({ canSign: z.boolean(), blockedReason: z.string().nullable(), requiredWallet: address }),
  checkpoint: advanceCheckpointSchema, indexer: advanceIndexerStatusSchema });
const publicPlan = z.object({ activityType: z.literal("GIFT_DISTRIBUTION"), channel: z.enum(["DIRECT", "INSTITUTION"]),
  recipientScope: z.string(), eligibilityBasis: z.string(), checklistVersion: z.literal("gift.v1"),
  stages: z.array(giftDraftSchema.shape.stages.element.safeExtend({ index: z.number().int(), milestoneId: uuid.nullable() })) });
export const advancePublicDetailSchema = z.object({ metadataId: uuid.nullable(), title: nullableText, description: nullableText,
  plan: publicPlan.nullable(), snapshot: advanceSnapshotSchema, workflow: advanceWorkflowSchema });
export const advancePublicListSchema = z.object({ context: advanceEvidenceContextSchema, items: z.array(z.object({ metadataId: uuid.nullable(),
  campaignId: uint256, title: z.string(), description: nullableText, workflow: advanceWorkflowSchema })) });
export const advanceEventsSchema = z.object({ context: advanceEvidenceContextSchema, campaignId: uint256, checkpoint: advanceCheckpointSchema,
  events: z.array(z.object({ transactionHash: hash, logIndex: z.number().int().nonnegative(), blockNumber: uint256, blockHash: hash,
    eventName: z.string(), args: z.record(z.string(), z.unknown()) })) });
export const advanceRefundsSchema = z.object({ context: advanceEvidenceContextSchema, items: z.array(z.object({ campaignId: uint256, metadataId: uuid.nullable(),
  wallet: address, contribution: uint256, base: uint256, supplement: uint256, baseConsumed: z.boolean(), supplementPaid: uint256,
  basePool: uint256, supplementPool: uint256, claimable: z.boolean(), checkpoint: advanceCheckpointSchema })) });
export const advanceEvidenceDraftSchema = z.object({ id: uuid, campaignMetadataId: uuid, milestoneIndex: uint256,
  organizerUserId: uuid, evidenceSchemaVersion: z.literal("0.2"), content: advanceEvidenceContentSchema,
  revision: z.number().int(), createdAt: z.string(), updatedAt: z.string() });
export const advanceFrozenPackageSchema = advancePackageSummarySchema.extend({ campaignMetadataId: uuid, organizerUserId: uuid,
  manifestBytes: z.string(), createdAt: z.string() });
export const advancePublicationSchema = z.object({ hash, packageId: uuid, manifestBytes: z.string(), createdBy: uuid, createdAt: z.string() });
export const advanceReviewQueueSchema = z.array(z.object({ id: uuid, title: z.string(), organizationId: uuid.nullable(), planHash: hash.nullable(), frozenAt: z.string().nullable() }));
export const advanceHealthSchema = z.object({ context: advanceEvidenceContextSchema, status: z.enum(["ready", "degraded"]),
  rpc: z.enum(["ready", "unavailable_or_identity_mismatch"]), storage: z.enum(["private_ready", "unavailable_or_policy_invalid"]),
  indexer: z.union([advanceIndexerStatusSchema, z.object({ status: z.literal("error"), error: z.string() })]) });
