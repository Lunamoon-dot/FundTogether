import { http } from './http';

export interface RewardTier {
  id: string;
  campaignId: string;
  tierIndex: number;
  title: string;
  description: string;
  price: string;
  maxQuantity: number;
  pledgedQuantity: number;
  isDigital: boolean;
  rewardItems: string[];
  estimatedDeliveryAt: string | null;
  createdAt: string;
}

export interface RewardCampaign {
  id: string;
  creatorUserId: string;
  organizationId: string | null;
  title: string;
  pitch: string;
  story: string;
  category: 'COMICS' | 'ARTBOOK' | 'ILLUSTRATION' | 'OTHER';
  commitmentHash: string | null;
  goal: string;
  fundingDuration: number;
  policyHash: string;
  onchainCampaignId: string | null;
  status: 'DRAFT' | 'FROZEN' | 'PUBLISHED' | 'ACTIVE' | 'PRODUCTION_VERIFIED' | 'COMPLETED' | 'STOPPED';
  frozenAt: string | null;
  createdAt: string;
  updatedAt: string;
  tiers: RewardTier[];
}

export interface RewardEntitlement {
  id: string;
  campaignId: string;
  tierId: string;
  backerUserId: string;
  backerWallet: string;
  quantity: number;
  amountPaid: string;
  txHash: string | null;
  status: 'PENDING_FUNDING' | 'ACTIVE' | 'REDEEM_REQUESTED' | 'FULFILLING' | 'DELIVERED' | 'CONFIRMED' | 'DISPUTED' | 'REFUND_ELIGIBLE';
  digitalAccessCode: string | null;
  shippingFullName: string | null;
  shippingAddress: string | null;
  shippingPhone: string | null;
  carrierTrackingCode: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tier: RewardTier;
  campaignTitle: string;
  campaignStatus: string;
  onchainCampaignId: string | null;
}

export interface RewardFulfillmentBatch {
  id: string;
  campaignId: string;
  batchNumber: number;
  title: string;
  carrier: string;
  manifestHash: string;
  shippedItemCount: number;
  shippedAt: string;
  createdAt: string;
}

export interface CreateRewardCampaignInput {
  title: string;
  pitch: string;
  story: string;
  category: 'COMICS' | 'ARTBOOK' | 'ILLUSTRATION' | 'OTHER';
  goal: string;
  fundingDuration: number;
  policyHash: string;
  tiers: {
    title: string;
    description: string;
    price: string;
    maxQuantity: number;
    isDigital: boolean;
    rewardItems: string[];
    estimatedDeliveryAt?: string;
  }[];
}

export async function listRewardPublicCampaigns(signal?: AbortSignal) {
  return (await http.get<RewardCampaign[]>('/v1/reward/public/campaigns', { signal })).data;
}

export async function getRewardPublicCampaign(id: string, signal?: AbortSignal) {
  return (await http.get<RewardCampaign>(`/v1/reward/public/campaigns/${id}`, { signal })).data;
}

export async function createRewardCampaignDraft(data: CreateRewardCampaignInput) {
  return (await http.post<RewardCampaign>('/v1/reward/creator/campaigns', data)).data;
}

export async function listMyRewardCampaigns(signal?: AbortSignal) {
  return (await http.get<RewardCampaign[]>('/v1/reward/creator/campaigns/mine', { signal })).data;
}

export async function freezeRewardCampaign(id: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/freeze`)).data;
}

export async function registerRewardOnchain(id: string, onchainCampaignId: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/onchain`, { onchainCampaignId })).data;
}

export async function notifyRewardPledge(data: { txHash: string }) {
  return (await http.post<{ entitlement: RewardEntitlement }>('/v1/reward/backer/notify-pledge', data)).data;
}

export async function createRewardPledge(data: { tierId: string; quantity: number; txHash: string; backerWallet: string }) {
  return notifyRewardPledge({ txHash: data.txHash });
}

export async function applyCreatorVerification(data: { displayName: string; bio: string; ipDeclaration: string }) {
  return (await http.post('/v1/reward/creator/profile', data)).data;
}

export async function getCreatorProfile(signal?: AbortSignal) {
  return (await http.get('/v1/reward/creator/profile', { signal })).data;
}

export async function submitCampaignReview(id: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/submit-review`)).data;
}

export async function listMyRewardEntitlements(signal?: AbortSignal) {
  return (await http.get<RewardEntitlement[]>('/v1/reward/backer/entitlements', { signal })).data;
}

export async function updateRewardShipping(entitlementId: string, data: { fullName: string; address: string; phone: string }) {
  return (await http.post<RewardEntitlement>(`/v1/reward/backer/entitlements/${entitlementId}/shipping`, data)).data;
}

export async function getDecryptedShipping(entitlementId: string, signal?: AbortSignal) {
  return (await http.get<{ fullName: string; address: string; phone: string } | null>(`/v1/reward/backer/entitlements/${entitlementId}/shipping`, { signal })).data;
}

export async function confirmRewardDelivery(entitlementId: string) {
  return (await http.post<RewardEntitlement>(`/v1/reward/backer/entitlements/${entitlementId}/confirm`)).data;
}

export async function openRewardDispute(entitlementId: string, data: { reason: string; evidenceHash?: string }) {
  return (await http.post(`/v1/reward/backer/entitlements/${entitlementId}/dispute`, data)).data;
}

export async function createFulfillmentBatch(campaignId: string, data: {
  batchNumber: number;
  title: string;
  carrier: string;
  manifestHash: string;
  shippedItemCount: number;
  trackingCodes: Record<string, string>;
}) {
  return (await http.post<RewardFulfillmentBatch>(`/v1/reward/creator/campaigns/${campaignId}/batches`, data)).data;
}

export async function listFulfillmentBatches(campaignId: string, signal?: AbortSignal) {
  return (await http.get<RewardFulfillmentBatch[]>(`/v1/reward/creator/campaigns/${campaignId}/batches`, { signal })).data;
}

export async function listEntitlementsToFulfill(campaignId: string, signal?: AbortSignal) {
  return (await http.get<RewardEntitlement[]>(`/v1/reward/creator/campaigns/${campaignId}/entitlements`, { signal })).data;
}
