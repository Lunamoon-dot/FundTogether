import { http } from './http';
import type { Campaign } from '../../features/campaigns/api/campaigns';

export interface CampaignTier {
  id: string;
  campaignId: string;
  tierIndex: number;
  title: string;
  description: string;
  price: string;
  maxQuantity: number;
  pledgedQuantity: number;
  isDigital: boolean;
  benefitItems: string[];
  estimatedDeliveryAt: string | null;
  createdAt: string;
}

export type CampaignRecord = Campaign;

export interface HistoricalEntitlement {
  id: string;
  campaignId: string;
  tierId: string;
  backerUserId: string;
  backerWallet: string;
  quantity: number;
  amountPaid: string;
  txHash: string | null;
  status:
    | 'PENDING_FUNDING'
    | 'ACTIVE'
    | 'REDEEM_REQUESTED'
    | 'FULFILLING'
    | 'DELIVERED'
    | 'CONFIRMED'
    | 'DISPUTED'
    | 'REFUND_ELIGIBLE'
    | 'REFUNDED';
  digitalAccessCode: string | null;
  createdAt: string;
  updatedAt: string;
  tier: CampaignTier;
  campaignTitle: string;
  campaignStatus: string;
  onchainCampaignId: string | null;
  contractAddress: string | null;
}


export interface HistoricalDispute {
  id: string;
  entitlementId: string;
  backerUserId: string;
  reason: string;
  evidenceHash: string | null;
  status: 'OPEN' | 'RESOLVED_CREATOR' | 'RESOLVED_BACKER' | 'DISMISSED';
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export async function listHistoricalCampaigns(signal?: AbortSignal) {
  return (await http.get<CampaignRecord[]>('/v1/fundtogether/public/campaigns', { signal })).data;
}

export async function getHistoricalCampaign(id: string, signal?: AbortSignal) {
  return (await http.get<CampaignRecord>(`/v1/fundtogether/public/campaigns/${id}`, { signal })).data;
}

export async function syncCampaignReceipt(
  txHash: string,
  campaignId: string,
  action: "pledge" | "activateCampaign" | "takeOverEligibility" | "finalizeFundingFailure" | "submitDisbursementRequest" | "approveAndDisburse" | "candidateExpenditure" | "finalizeExpenditure" | "returnFunds" | "openDisputeCase" | "upholdDisputeCase" | "recordProductionVerified" | "recordFulfillmentComplete" | "completeCampaign" | "startWindDown" | "claimRefund",
) {
  return (await http.post<{ entitlementsCreated: number; digitalKeysIssued: number; eventsProcessed?: number }>(
    '/v1/fundtogether/public/sync-receipt',
    { txHash, campaignId, action },
  )).data;
}

export async function freezeCampaignRecord(id: string) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/creator/campaigns/${id}/freeze`)).data;
}

export async function registerHistoricalCampaignOnchain(id: string, onchainCampaignId: string, txHash?: string) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/creator/campaigns/${id}/onchain`, {
    onchainCampaignId,
    ...(txHash ? { txHash } : {}),
  })).data;
}

export async function completeCampaignRecord(id: string, txHash: string) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/creator/campaigns/${id}/complete`, { txHash })).data;
}


export async function notifyHistoricalPledge(data: { txHash: string; campaignId: string }) {
  return (await http.post<{ entitlement: HistoricalEntitlement }>('/v1/fundtogether/backer/notify-pledge', data)).data;
}

export async function claimHistoricalRefund(data: { txHash: string; campaignId: string }) {
  return (await http.post<{ synced: boolean; txHash: string; refundedEntitlements: HistoricalEntitlement[] }>(
    '/v1/fundtogether/backer/claim-refund',
    data,
  )).data;
}

export async function createCampaignPledge(data: { campaignId: string; tierId: string; quantity: number; txHash: string; backerWallet: string }) {
  return notifyHistoricalPledge({ txHash: data.txHash, campaignId: data.campaignId });
}

export async function submitCampaignReview(id: string) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/creator/campaigns/${id}/submit-review`)).data;
}

export async function listMyHistoricalEntitlements(signal?: AbortSignal) {
  return (await http.get<HistoricalEntitlement[]>('/v1/fundtogether/backer/entitlements', { signal })).data;
}




export async function openHistoricalDispute(entitlementId: string, data: { reason: string; evidenceHash?: string }) {
  return (await http.post(`/v1/fundtogether/backer/entitlements/${entitlementId}/dispute`, data)).data;
}




export async function listResolverHistoricalDisputes(signal?: AbortSignal) {
  return (await http.get<HistoricalDispute[]>('/v1/fundtogether/resolver/disputes', { signal })).data;
}

export async function reviewResolverCampaignRecord(
  campaignId: string,
  data: { outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'; decisionReason: string },
) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/resolver/campaigns/${campaignId}/review`, data)).data;
}

export async function activateResolverCampaignRecord(campaignId: string, txHash: string) {
  return (await http.post<CampaignRecord>(`/v1/fundtogether/resolver/campaigns/${campaignId}/activate`, { txHash })).data;
}

export async function verifyResolverCampaignProduction(
  campaignId: string,
  data: { txHash: string; productionReportHash?: string },
) {
  return (await http.post<CampaignRecord & { digitalKeysIssued?: number }>(
    `/v1/fundtogether/resolver/campaigns/${campaignId}/production-verified`,
    data,
  )).data;
}


export async function resolveResolverHistoricalDispute(
  disputeId: string,
  data: { outcome: 'RESOLVED_CREATOR' | 'RESOLVED_BACKER' | 'DISMISSED'; resolutionNote: string },
) {
  return (await http.post<HistoricalDispute>(`/v1/fundtogether/resolver/disputes/${disputeId}/resolve`, data)).data;
}

