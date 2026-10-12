import type { Address, Hex } from "viem";

export const REWARD_DEPLOYMENT = Symbol("REWARD_DEPLOYMENT");
export const REWARD_CAMPAIGN_STATES = ["FUNDING", "ACTIVE", "PRODUCTION_VERIFIED", "COMPLETED", "STOPPED"] as const;
export const REWARD_REQUEST_STATES = ["SUBMITTED", "APPROVED_DISBURSED", "EXPENDITURE_CANDIDATE", "FINANCIALLY_SETTLED", "CANCELLED"] as const;
export const REWARD_ENTITLEMENT_STATES = ["PENDING_FUNDING", "ACTIVE", "REDEEM_REQUESTED", "FULFILLING", "DELIVERED", "CONFIRMED", "DISPUTED", "REFUND_ELIGIBLE"] as const;

export interface RewardContext {
  protocolKind: "REWARD";
  chainId: number;
  contractAddress: Address;
  tokenAddress: Address;
  resolver: Address;
  backupResolver: Address;
  policyHash: Hex;
  abiVersion: "1";
  confirmations: number;
}

export interface RewardDeployment extends RewardContext {
  rpcUrl: string;
  tokenDecimals: number;
  genesisHash: Hex;
  contractCodeHash: Hex;
  tokenCodeHash: Hex;
  deploymentBlockNumber: string;
  deploymentBlockHash: Hex;
  abiHash: Hex;
}

export interface RewardCheckpoint {
  blockNumber: string;
  blockHash: Hex;
  chainTimestamp: string;
}

export interface RewardTierOnchainView {
  price: string;
  maxQuantity: string;
  pledgedQuantity: string;
  isDigital: boolean;
}

export interface RewardCampaignOnchainView {
  creator: Address;
  commitmentHash: Hex;
  goal: string;
  fundingEnd: string;
  fullyFundedAt: string;
  activeAt: string;
  executionEnd: string;
  state: typeof REWARD_CAMPAIGN_STATES[number];
  contributed: string;
  available: string;
  grossPaid: string;
  basePool: string;
  supplementPool: string;
  refunded: string;
  refundSnapshotted: boolean;
  productionReportHash: Hex;
}

export interface RewardRequestOnchainView {
  requestHash: Hex;
  recipient: Address;
  approvedAmount: string;
  grossPaid: string;
  returned: string;
  acceptedExpenditure: string;
  expenditureReportHash: Hex;
  submittedAt: string;
  approvedAt: string;
  challengeEnd: string;
  state: typeof REWARD_REQUEST_STATES[number];
}

export interface RewardCampaignSnapshot {
  context: RewardContext;
  checkpoint: RewardCheckpoint;
  campaignId: string;
  campaign: RewardCampaignOnchainView;
  tiers: RewardTierOnchainView[];
  requests: RewardRequestOnchainView[];
}
