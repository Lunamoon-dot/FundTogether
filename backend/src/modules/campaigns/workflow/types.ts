import type { Address, Hex } from "viem";

export const CAMPAIGNS_DEPLOYMENT = Symbol("CAMPAIGNS_DEPLOYMENT");
export const CAMPAIGNS_CAMPAIGN_STATES = ["FUNDING", "ACTIVE", "PRODUCTION_VERIFIED", "COMPLETED", "STOPPED"] as const;
export const CAMPAIGNS_REQUEST_STATES = ["SUBMITTED", "APPROVED_DISBURSED", "EXPENDITURE_CANDIDATE", "FINANCIALLY_SETTLED", "CANCELLED"] as const;
export const CAMPAIGNS_ENTITLEMENT_STATES = ["PENDING_FUNDING", "ACTIVE", "REDEEM_REQUESTED", "FULFILLING", "DELIVERED", "CONFIRMED", "DISPUTED", "REFUND_ELIGIBLE"] as const;

export interface CampaignContext {
  protocolKind: "CAMPAIGNS";
  chainId: number;
  contractAddress: Address;
  tokenAddress: Address;
  resolver: Address;
  backupResolver: Address;
  policyHash: Hex;
  abiVersion: "1";
  confirmations: number;
}

export interface CampaignDeployment extends CampaignContext {
  rpcUrl: string;
  tokenDecimals: number;
  genesisHash: Hex;
  contractCodeHash: Hex;
  tokenCodeHash: Hex;
  deploymentBlockNumber: string;
  deploymentBlockHash: Hex;
  abiHash: Hex;
}

export interface CampaignCheckpoint {
  blockNumber: string;
  blockHash: Hex;
  chainTimestamp: string;
}

export interface CampaignTierOnchainView {
  price: string;
  maxQuantity: string;
  pledgedQuantity: string;
  isDigital: boolean;
}

export interface CampaignOnchainView {
  creator: Address;
  commitmentHash: Hex;
  goal: string;
  fundingEnd: string;
  fullyFundedAt: string;
  activeAt: string;
  executionEnd: string;
  state: typeof CAMPAIGNS_CAMPAIGN_STATES[number];
  contributed: string;
  available: string;
  grossPaid: string;
  basePool: string;
  supplementPool: string;
  refunded: string;
  refundSnapshotted: boolean;
  productionReportHash: Hex;
}

export interface CampaignRequestOnchainView {
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
  state: typeof CAMPAIGNS_REQUEST_STATES[number];
}

export interface CampaignSnapshot {
  context: CampaignContext;
  checkpoint: CampaignCheckpoint;
  campaignId: string;
  campaign: CampaignOnchainView;
  tiers: CampaignTierOnchainView[];
  requests: CampaignRequestOnchainView[];
}
