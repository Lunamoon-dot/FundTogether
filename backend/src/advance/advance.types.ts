import type { Address, Hex } from "viem";

export const ADVANCE_STATES = ["DRAFT", "APPROVED", "FUNDING", "FIRST_REVIEW", "ADVANCE_AVAILABLE",
  "EXECUTING", "EVIDENCE_REVIEW", "SUPPLEMENT_DUE", "CHALLENGE_WINDOW", "CASE_OPEN", "COMPLETED", "STOPPED"] as const;
export const STAGE_STATES = ["PENDING", "ADVANCED", "EVIDENCE_REVIEW", "SUPPLEMENT_DUE", "CHALLENGE_WINDOW", "CASE_OPEN", "FINALIZED", "STOPPED"] as const;
export const REVIEW_OUTCOMES = ["MET", "NEEDS_INFORMATION", "NOT_MET", "INCONCLUSIVE"] as const;
export const CASE_RESOLUTIONS = ["PENDING", "CONTINUE", "RESUBMIT", "STOP", "TIMEOUT"] as const;
export const ADVANCE_DEPLOYMENT = Symbol("ADVANCE_DEPLOYMENT");

export interface AdvanceContext {
  protocolKind: "ADVANCE";
  chainId: number;
  deploymentId: Hex;
  contractAddress: Address;
  tokenAddress: Address;
  resolver: Address;
  workflowPolicy: Hex;
  abiVersion: "1";
  confirmations: number;
}
export interface AdvanceDeployment extends AdvanceContext {
  rpcUrl: string;
  tokenDecimals: number;
  genesisHash: Hex;
  contractCodeHash: Hex;
  tokenCodeHash: Hex;
  deploymentBlockNumber: string;
  deploymentBlockHash: Hex;
  abiHash: Hex;
  policyHash: Hex;
}
export interface AdvanceCheckpoint { blockNumber: string; blockHash: Hex; chainTimestamp: string }
export interface AdvanceCampaignView {
  organizer: Address; planHash: Hex; goal: string; fundingDuration: string;
  state: typeof ADVANCE_STATES[number]; currentStage: string; fundingEnd: string;
  firstReviewEnd: string; claimEnd: string; contributed: string; advanced: string;
  returned: string; refunded: string; custody: string; refundSnapshotted: boolean;
  basePool: string; supplementPool: string;
}
export interface AdvanceStageView {
  budget: string; criteriaHash: Hex; state: typeof STAGE_STATES[number]; advanced: string;
  returned: string; latestVersion: string; hardStop: string; submissionEnd: string;
  reviewEnd: string; challengeEnd: string; finalizeEnd: string; acceptedCampaignSpent: string;
  declaredUnused: string; publicHash: Hex; reportHash: Hex;
}
export interface AdvanceSubmissionView {
  version: string; evidenceHash: Hex; parentVersion: string; submittedAt: string; reviewed: boolean;
  outcome: typeof REVIEW_OUTCOMES[number] | null; reportHash: Hex; publicHash: Hex;
}
export interface AdvanceCaseView {
  opener: Address; reasonHash: Hex; responseHash: Hex; responseEnd: string; resolutionEnd: string;
  resolution: typeof CASE_RESOLUTIONS[number]; resolutionReasonHash: Hex; caseUsed: boolean;
}
export interface AdvanceCampaignSnapshot {
  context: AdvanceContext; checkpoint: AdvanceCheckpoint; campaignId: string;
  campaign: AdvanceCampaignView;
  stages: (AdvanceStageView & { submissions: (AdvanceSubmissionView & { challengeCase: AdvanceCaseView })[] })[];
  published: boolean; publicationTransactionHash: Hex | null;
}
export interface AdvanceSubmissionPlan {
  context: AdvanceContext; draftKey: Hex; organizer: Address; planHash: Hex; planBytes: string;
  fundingDuration: string; budgets: string[]; criteriaHashes: Hex[]; expectedRevision: number;
}
export interface AdvanceActionPreparation {
  context: AdvanceContext; checkpoint: AdvanceCheckpoint; actorWallet: Address;
  contractAddress: Address; functionName: string; args: unknown[];
  recordHash: Hex | null; blockedReason: string | null;
}
export interface AdvanceWorkflow {
  context: AdvanceContext; checkpoint: AdvanceCheckpoint; campaignId: string; currentStage: string;
  state: typeof ADVANCE_STATES[number]; stageState: typeof STAGE_STATES[number];
  goal: string; contributed: string; advanced: string; returned: string; refunded: string;
  custody: string; basePool: string; supplementPool: string;
  deadlines: Record<"fundingEnd" | "firstReviewEnd" | "claimEnd" | "submissionEnd" | "reviewEnd"
    | "challengeEnd" | "responseEnd" | "resolutionEnd" | "finalizeEnd" | "hardStop", string>;
}
