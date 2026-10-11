import { http } from './http'

export interface HedCampaignDraftInput {
  title: string; description: string; purpose: string; beneficiaryScope: string; allowedExpenseCategories: string[];
  outcomeCriteria: string[]; goal: string; fundingDuration: number; policyHash: `0x${string}`
}
export interface HedCampaignDraft extends HedCampaignDraftInput {
  id: string; organizationId: string; commitmentHash: string | null; frozenAt: string | null; onchainCampaignId?: string | null
}

export async function listHedCampaignDrafts(organizationId: string, signal?: AbortSignal) {
  return (await http.get<HedCampaignDraft[]>(`/v1/disbursement/campaigns/organization/${organizationId}`, { signal })).data
}
export async function createHedCampaignDraft(organizationId: string, value: HedCampaignDraftInput) {
  return (await http.post<HedCampaignDraft>(`/v1/disbursement/campaigns/organization/${organizationId}`, value)).data
}
export async function freezeHedCampaignDraft(id: string) {
  return (await http.post<{ campaignId: string; commitmentHash: string; frozenAt: string }>(`/v1/disbursement/campaigns/${id}/freeze`)).data
}
export async function registerHedOnchainCampaign(id: string, onchainCampaignId: string) {
  return (await http.post<{ campaignId: string; onchainCampaignId: string }>(`/v1/disbursement/campaigns/${id}/onchain`, { onchainCampaignId })).data
}

export interface HedVendorOption { id: string; vendorWallet: string; content: { legalName: string; categories: string[] }; validUntil: string }
export interface HedActivityInput { title: string; beneficiaryScope: string; targetQuantity: number; outcomeCriteria: string[]; ceiling: string; deliveryDeadline: string; outcomeDeadline: string }
export interface HedActivityDraft extends HedActivityInput { id: string; commitmentHash: string | null; frozenAt: string | null; onchainActivityId: string | null }
export async function listHedActivities(campaignId: string, signal?: AbortSignal) {
  return (await http.get<HedActivityDraft[]>(`/v1/disbursement/campaigns/${campaignId}/activities`, { signal })).data
}
export async function createHedActivity(campaignId: string, value: HedActivityInput) {
  return (await http.post<HedActivityDraft>(`/v1/disbursement/campaigns/${campaignId}/activities`, value)).data
}
export async function freezeHedActivity(campaignId: string, activityId: string) {
  return (await http.post<HedActivityDraft>(`/v1/disbursement/campaigns/${campaignId}/activities/${activityId}/freeze`)).data
}
export async function registerHedOnchainActivity(campaignId: string, activityId: string, onchainActivityId: string) {
  return (await http.post<HedActivityDraft>(`/v1/disbursement/campaigns/${campaignId}/activities/${activityId}/onchain`, { onchainActivityId })).data
}

export interface HedRequestDraftInput { vendorVerificationId: string; activityId: string; purpose: string;
  itemLines: { description: string; quantity: number; unitAmount: string }[]; amount: string; deposit: string;
  expectedDeliveryAt: string; acceptanceCriteria: string[]; terms: string; needEvidenceReferences: string[] }
export interface HedRequestDraft extends HedRequestDraftInput { id: string; version: number; requestHash: string | null; frozenAt: string | null }

export async function listHedVendorOptions(campaignId: string, signal?: AbortSignal) {
  return (await http.get<HedVendorOption[]>(`/v1/disbursement/campaigns/${campaignId}/vendors`, { signal })).data
}
export async function listHedRequestDrafts(campaignId: string, signal?: AbortSignal) {
  return (await http.get<HedRequestDraft[]>(`/v1/disbursement/campaigns/${campaignId}/requests`, { signal })).data
}
export async function createHedRequestDraft(campaignId: string, value: HedRequestDraftInput) {
  return (await http.post<HedRequestDraft>(`/v1/disbursement/campaigns/${campaignId}/requests`, value)).data
}
export async function uploadHedRequestEvidence(campaignId: string, requestId: string, kind: 'QUOTE' | 'NEED' | 'TERMS' | 'OTHER', file: File) {
  const body = new FormData(); body.set('kind', kind); body.set('file', file)
  return (await http.post(`/v1/disbursement/campaigns/${campaignId}/requests/${requestId}/evidence`, body, { headers: { 'Content-Type': undefined } })).data
}
export async function freezeHedRequestDraft(campaignId: string, requestId: string) {
  return (await http.post<HedRequestDraft>(`/v1/disbursement/campaigns/${campaignId}/requests/${requestId}/freeze`)).data
}

export interface HedReviewInput { evidenceVersion: number; criterionId: string; outcome: 'MET' | 'NOT_MET' | 'NEEDS_INFO';
  reasonCode: string; reason: string; manifestHash: `0x${string}`; publicHash?: `0x${string}`; sourceReferences: string[] }
export async function listHedReviews(requestId: string, signal?: AbortSignal) {
  return (await http.get<HedReviewInput[]>(`/v1/disbursement/requests/${requestId}/reviews`, { signal })).data
}
export async function recordHedReview(requestId: string, review: HedReviewInput) {
  return (await http.post(`/v1/disbursement/requests/${requestId}/reviews`, review)).data
}
