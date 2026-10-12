import type { Address, Hex } from "viem";

export const HED_DEPLOYMENT = Symbol("HED_DEPLOYMENT");
export const HED_CAMPAIGN_STATES = ["FUNDING", "ACTIVE", "WIND_DOWN", "COMPLETED", "STOPPED"] as const;
export const HED_REQUEST_STATES = ["DRAFT", "SUBMITTED", "APPROVED_DISBURSED", "EXPENDITURE_CANDIDATE", "FINANCIALLY_SETTLED", "CANCELLED"] as const;
export const HED_ACTIVITY_STATES = ["OPEN", "OUTCOME_CANDIDATE", "VERIFIED", "CANCELLED_NO_SPEND", "FAILED"] as const;

export interface HedContext {
  protocolKind: "HED";
  chainId: number;
  contractAddress: Address;
  tokenAddress: Address;
  resolver: Address;
  backupResolver: Address;
  policyHash: Hex;
  abiVersion: "1";
  confirmations: number;
}

export interface HedDeployment extends HedContext {
  rpcUrl: string;
  tokenDecimals: number;
  genesisHash: Hex;
  contractCodeHash: Hex;
  tokenCodeHash: Hex;
  deploymentBlockNumber: string;
  deploymentBlockHash: Hex;
  abiHash: Hex;
}

export interface HedCheckpoint { blockNumber: string; blockHash: Hex; chainTimestamp: string }
export interface HedCampaignView {
  organizer: Address; commitmentHash: Hex; goal: string; fundingEnd: string; fullyFundedAt: string;
  state: typeof HED_CAMPAIGN_STATES[number]; contributed: string; available: string; reserved: string;
  grossPaid: string; basePool: string; supplementPool: string; refunded: string; refundSnapshotted: boolean;
}
export interface HedActivityView { commitmentHash: Hex; outcomeReportHash: Hex; ceiling: string; approved: string; createdAt: string; challengeEnd: string; state: typeof HED_ACTIVITY_STATES[number] }
export interface HedRequestView {
  activityId: string; requestHash: Hex; recipient: Address; vendor?: Address; termsHash: Hex; approvedAmount: string;
  grossPaid: string; returned: string; acceptedExpenditure: string; acceptedDeliveryValue?: string;
  expenditureReportHash: Hex; deliveryReportHash?: Hex;
  challengeEnd: string; state: typeof HED_REQUEST_STATES[number];
}
export interface HedRiskProjection {
  maxRequestCap: string;
  financialExposure: string;
  financialExposureLimit: string;
  financialExposureRatioBps: number;
  outcomeExposure: string;
  outcomeExposureLimit: string;
  outcomeExposureRatioBps: number;
  hasOpenRequest: boolean;
  hasOpenActivity: boolean;
  canCreateRequest: boolean;
}
export interface HedCampaignSnapshot {
  context: HedContext; checkpoint: HedCheckpoint; campaignId: string; campaign: HedCampaignView;
  activities: HedActivityView[]; requests: HedRequestView[]; riskProjection: HedRiskProjection;
}
