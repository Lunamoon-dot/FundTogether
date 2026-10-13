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
  category: 'COMICS_ARTBOOK' | 'COMICS' | 'ARTBOOK' | 'ILLUSTRATION' | 'OTHER';
  draftConfig: CreateRewardCampaignInput | null;
  reviewPreparation?: EditionsPreparation | null;
  frozenSnapshot?: EditionsSnapshot | null;
  revision?: number;
  reviews?: { id: string; outcome: string; decisionReason: string; commitmentHash: string }[];
  commitmentHash: string | null;
  goal: string;
  fundingDuration: number;
  policyHash: string | null;
  onchainCampaignId: string | null;
  status:
    | 'DRAFT'
    | 'FROZEN'
    | 'UNDER_REVIEW'
    | 'APPROVED'
    | 'PUBLISHED'
    | 'ACTIVE'
    | 'PRODUCTION_VERIFIED'
    | 'FULFILLMENT_COMPLETE'
    | 'COMPLETED'
    | 'STOPPED';
  frozenAt: string | null;
  createdAt: string;
  updatedAt: string;
  tiers: RewardTier[];
  projection?: Record<string, any> | null;
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
  tier: RewardTier;
  campaignTitle: string;
  campaignStatus: string;
  onchainCampaignId: string | null;
  contractAddress: string | null;
}


export interface RewardCreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  ipDeclaration: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RewardDispute {
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

export interface CreateRewardCampaignInput {
  mode: 'REWARD_V1';
  policyVersion: 'reward-comic-download-mvp-v1';
  title: string;
  pitch: string;
  story: string;
  category: 'COMICS_ARTBOOK';
  goal: string;
  fundingDuration: number;
  tiers: {
    tierType: 'STANDARD';
    title: string;
    description: string;
    price: string;
    rewardItems: { type: 'DIGITAL_DOWNLOAD'; format: 'PDF'; title: string; description: string }[];
    estimatedDeliveryAt?: string;
  }[];
}

export interface EditionsSample { id: string; sha256: string; mediaType: string; sizeBytes: number }
export interface EditionsPreparation {
  payoutWalletLinkId: string;
  sampleIds: string[];
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
  releaseWindow: { start: string; end: string };
}
export interface EditionsSnapshot {
  commitmentVersion: 'editions-review-v1';
  config: CreateRewardCampaignInput;
  creator: { userId: string; profileId: string; displayName: string; ipDeclaration: string };
  payoutWallet: { linkId: string; address: string; chainId: string };
  preparation: Omit<EditionsPreparation, 'payoutWalletLinkId' | 'sampleIds'>;
  samples: EditionsSample[];
}
const editionsPath = (id: string) => `/v1/reward/editions/campaigns/${id}`;
export async function listEditionsWallets(signal?: AbortSignal) {
  return (await http.get<{ id: string; address: string; chainId: string }[]>('/v1/reward/editions/wallets', { signal })).data;
}
export async function listEditionsSamples(id: string, signal?: AbortSignal) {
  return (await http.get<EditionsSample[]>(`${editionsPath(id)}/samples`, { signal })).data;
}
export async function uploadEditionsSample(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return (await http.post<EditionsSample>(`${editionsPath(id)}/samples`, body, { headers: { 'Content-Type': undefined } })).data;
}
export async function getEditionsSample(id: string, sampleId: string) {
  return (await http.get<Blob>(`${editionsPath(id)}/samples/${sampleId}`, { responseType: 'blob' })).data;
}
export async function updateEditionsPreparation(id: string, data: { revision: number; config: CreateRewardCampaignInput; preparation: EditionsPreparation }) {
  return (await http.patch<RewardCampaign>(editionsPath(id), data)).data;
}
export async function freezeEditions(id: string, revision: number) {
  return (await http.post<RewardCampaign>(`${editionsPath(id)}/freeze`, { revision })).data;
}
export async function submitEditionsReview(id: string, revision: number) {
  return (await http.post<RewardCampaign>(`${editionsPath(id)}/submit-review`, { revision })).data;
}
export async function reviewEditions(id: string, data: { outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'; decisionReason: string; commitmentHash: string }) {
  return (await http.post<RewardCampaign>(`${editionsPath(id)}/review`, data)).data;
}

export async function listRewardPublicCampaigns(signal?: AbortSignal) {
  return (await http.get<RewardCampaign[]>('/v1/reward/public/campaigns', { signal })).data;
}

export async function getRewardPublicCampaign(id: string, signal?: AbortSignal) {
  return (await http.get<RewardCampaign>(`/v1/reward/public/campaigns/${id}`, { signal })).data;
}

export async function syncRewardReceipt(txHash: string) {
  return (await http.post<{ entitlementsCreated: number; digitalKeysIssued: number; eventsProcessed?: number }>(
    '/v1/reward/public/sync-receipt',
    { txHash },
  )).data;
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

export async function registerRewardOnchain(id: string, onchainCampaignId: string, txHash?: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/onchain`, {
    onchainCampaignId,
    ...(txHash ? { txHash } : {}),
  })).data;
}

export async function completeRewardCampaign(id: string, txHash: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/complete`, { txHash })).data;
}


export async function notifyRewardPledge(data: { txHash: string }) {
  return (await http.post<{ entitlement: RewardEntitlement }>('/v1/reward/backer/notify-pledge', data)).data;
}

export async function claimRewardRefund(data: { txHash: string }) {
  return (await http.post<{ synced: boolean; txHash: string; refundedEntitlements: RewardEntitlement[] }>(
    '/v1/reward/backer/claim-refund',
    data,
  )).data;
}

export async function createRewardPledge(data: { tierId: string; quantity: number; txHash: string; backerWallet: string }) {
  return notifyRewardPledge({ txHash: data.txHash });
}

export async function applyCreatorVerification(data: { displayName: string; bio: string; ipDeclaration: string }) {
  return (await http.post<RewardCreatorProfile>('/v1/reward/creator/profile', data)).data;
}

export async function getCreatorProfile(signal?: AbortSignal) {
  return (await http.get<RewardCreatorProfile | null>('/v1/reward/creator/profile', { signal })).data;
}

export async function submitCampaignReview(id: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/creator/campaigns/${id}/submit-review`)).data;
}

export async function listMyRewardEntitlements(signal?: AbortSignal) {
  return (await http.get<RewardEntitlement[]>('/v1/reward/backer/entitlements', { signal })).data;
}




export async function openRewardDispute(entitlementId: string, data: { reason: string; evidenceHash?: string }) {
  return (await http.post(`/v1/reward/backer/entitlements/${entitlementId}/dispute`, data)).data;
}




export async function listAdminCreatorProfiles(signal?: AbortSignal) {
  return (await http.get<RewardCreatorProfile[]>('/v1/reward/admin/creators', { signal })).data;
}

export async function reviewAdminCreatorProfile(
  profileId: string,
  data: { outcome: 'VERIFIED' | 'REJECTED'; rejectionReason?: string },
) {
  return (await http.post<RewardCreatorProfile>(`/v1/reward/admin/creators/${profileId}/review`, data)).data;
}

export async function listResolverRewardCampaigns(signal?: AbortSignal) {
  return (await http.get<RewardCampaign[]>('/v1/reward/resolver/campaigns', { signal })).data;
}

export async function listResolverRewardDisputes(signal?: AbortSignal) {
  return (await http.get<RewardDispute[]>('/v1/reward/resolver/disputes', { signal })).data;
}

export async function reviewResolverRewardCampaign(
  campaignId: string,
  data: { outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'; decisionReason: string },
) {
  return (await http.post<RewardCampaign>(`/v1/reward/resolver/campaigns/${campaignId}/review`, data)).data;
}

export async function activateResolverRewardCampaign(campaignId: string, txHash: string) {
  return (await http.post<RewardCampaign>(`/v1/reward/resolver/campaigns/${campaignId}/activate`, { txHash })).data;
}

export async function verifyResolverRewardProduction(
  campaignId: string,
  data: { txHash: string; productionReportHash?: string },
) {
  return (await http.post<RewardCampaign & { digitalKeysIssued?: number }>(
    `/v1/reward/resolver/campaigns/${campaignId}/production-verified`,
    data,
  )).data;
}


export async function resolveResolverRewardDispute(
  disputeId: string,
  data: { outcome: 'RESOLVED_CREATOR' | 'RESOLVED_BACKER' | 'DISMISSED'; resolutionNote: string },
) {
  return (await http.post<RewardDispute>(`/v1/reward/resolver/disputes/${disputeId}/resolve`, data)).data;
}

