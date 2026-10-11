import { http } from './http'

export interface HedPublicSnapshot { campaignId: string; checkpoint: { blockNumber: string; blockHash: string; chainTimestamp: string }; campaign: { goal: string; contributed: string; available: string; reserved: string; grossPaid: string; refundSnapshotted: boolean; basePool: string; supplementPool: string; state: string }; activities: { commitmentHash: `0x${string}`; outcomeReportHash: `0x${string}`; ceiling: string; approved: string; createdAt: string; challengeEnd: string; state: string }[]; requests: { requestHash: `0x${string}`; approvedAmount: string; depositAmount: string; grossPaid: string; acceptedDeliveryValue: string; deliveryReportHash: `0x${string}`; challengeEnd: string; state: string }[] }
export async function getHedPublicCampaign(campaignId: string, signal?: AbortSignal) {
  return (await http.get<HedPublicSnapshot>(`/v1/disbursement/public/campaigns/${campaignId}`, { signal })).data
}
export async function listHedPublicCampaigns(signal?: AbortSignal) {
  return (await http.get<HedPublicSnapshot[]>('/v1/disbursement/public/campaigns', { signal })).data
}

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
export interface HedVendorVerificationInput { vendorWallet: `0x${string}`; legalName: string; contact: string; categories: string[]; relatedPartyDeclaration: false; validUntil: string }
export interface HedVendorVerification { id: string; vendorWallet: `0x${string}`; content: HedVendorVerificationInput; status: string; reportHash: `0x${string}`; validUntil: string; createdAt: string }
export async function listHedVendorVerifications(signal?: AbortSignal) {
  return (await http.get<HedVendorVerification[]>('/v1/disbursement/vendors', { signal })).data
}
export async function verifyHedVendor(value: HedVendorVerificationInput) {
  return (await http.post<HedVendorVerification>('/v1/disbursement/vendors/verify', value)).data
}
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
export interface HedRequestDraft extends HedRequestDraftInput { id: string; version: number; requestHash: string | null; frozenAt: string | null; onchainRequestId: string | null }

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
export async function registerHedOnchainRequest(campaignId: string, requestId: string, onchainRequestId: string) {
  return (await http.post(`/v1/disbursement/campaigns/${campaignId}/requests/${requestId}/onchain`, { onchainRequestId })).data
}

export interface HedReviewInput { evidenceVersion: number; criterionId: string; outcome: 'MET' | 'NOT_MET' | 'NEEDS_INFO';
  reasonCode: string; reason: string; manifestHash: `0x${string}`; publicHash?: `0x${string}`; sourceReferences: string[] }
export async function listHedReviews(requestId: string, signal?: AbortSignal) {
  return (await http.get<HedReviewInput[]>(`/v1/disbursement/requests/${requestId}/reviews`, { signal })).data
}
export async function recordHedReview(requestId: string, review: HedReviewInput) {
  return (await http.post(`/v1/disbursement/requests/${requestId}/reviews`, review)).data
}
export interface HedReviewQueueItem { requestId: string; requestHash: string; onchainCampaignId: string; onchainRequestId: string; content: HedRequestDraftInput }
export async function listHedPendingReviews(signal?: AbortSignal) {
  return (await http.get<HedReviewQueueItem[]>('/v1/disbursement/reviews/pending', { signal })).data
}
export interface HedCampaignActivation { campaignId: string; onchainCampaignId: string; eligibilityHash: `0x${string}` }
export async function listHedPendingCampaigns(signal?: AbortSignal) {
  return (await http.get<HedCampaignActivation[]>('/v1/disbursement/reviews/campaigns/pending', { signal })).data
}
export async function prepareHedCampaignActivation(campaignId: string) {
  return (await http.post<HedCampaignActivation>(`/v1/disbursement/reviews/campaigns/${campaignId}/activation`)).data
}
export interface HedApprovalPayload { onchainCampaignId: string; onchainRequestId: string; expectedRequestHash: `0x${string}` }
export async function prepareHedRequestApproval(requestId: string) {
  return (await http.post<HedApprovalPayload>(`/v1/disbursement/requests/${requestId}/reviews/approval`)).data
}
export interface HedDeliveryPackage { kind: 'DELIVERY'; requestDraftId: string; activityId: string; evidenceVersion: number; manifestHash: `0x${string}`; publicHash: `0x${string}`; publicDocumentId: string; acceptedValue: string; documentIds: string[] }
export interface HedDeliveryQueueItem { packageId: string; requestId: string; onchainCampaignId: string; onchainRequestId: string; requestHash: `0x${string}`; content: HedDeliveryPackage }
export async function listHedPendingDeliveryReviews(signal?: AbortSignal) {
  return (await http.get<HedDeliveryQueueItem[]>('/v1/disbursement/reviews/delivery/pending', { signal })).data
}
export interface HedDeliveryPayload { onchainCampaignId: string; onchainRequestId: string; acceptedValue: string; reportHash: `0x${string}` }
export async function prepareHedDelivery(packageId: string) {
  return (await http.post<HedDeliveryPayload>(`/v1/disbursement/reviews/delivery/${packageId}/prepare`)).data
}
export interface HedOutcomePackage { kind: 'OUTCOME'; activityId: string; evidenceVersion: number; manifestHash: `0x${string}`; publicHash: `0x${string}`; publicDocumentId: string; deliveredQuantity: number; documentIds: string[] }
export interface HedOutcomeQueueItem { packageId: string; activityId: string; onchainCampaignId: string; onchainActivityId: string; content: HedOutcomePackage }
export interface HedOutcomePayload { onchainCampaignId: string; onchainActivityId: string; reportHash: `0x${string}` }
export async function listHedPendingOutcomes(signal?: AbortSignal) {
  return (await http.get<HedOutcomeQueueItem[]>('/v1/disbursement/reviews/outcomes/pending', { signal })).data
}
export async function recordHedOutcomeReview(activityId: string, review: HedReviewInput) {
  return (await http.post(`/v1/disbursement/activities/${activityId}/reviews`, review)).data
}
export async function prepareHedOutcome(activityId: string, packageId: string) {
  return (await http.post<HedOutcomePayload>(`/v1/disbursement/activities/${activityId}/reviews/outcome/${packageId}`)).data
}
export interface HedEvidenceDocument { id: string; sha256: `0x${string}`; originalName: string; mediaType: string; byteSize: number }
export interface HedDeliveryPackageInput { kind: 'DELIVERY'; requestDraftId: string; activityId: string; evidenceVersion: number; publicDocumentId: string; acceptedValue: string; documentIds: string[] }
export interface HedOutcomePackageInput { kind: 'OUTCOME'; activityId: string; evidenceVersion: number; publicDocumentId: string; deliveredQuantity: number; documentIds: string[] }
export async function uploadHedEvidence(campaignId: string, value: { kind: 'DELIVERY' | 'OUTCOME'; activityId: string; requestDraftId?: string; visibility: 'PRIVATE' | 'PUBLIC'; file: File }) {
  const body = new FormData(); body.set('kind', value.kind); body.set('activityId', value.activityId); body.set('visibility', value.visibility); if (value.requestDraftId) body.set('requestDraftId', value.requestDraftId); body.set('file', value.file)
  return (await http.post<HedEvidenceDocument>(`/v1/disbursement/campaigns/${campaignId}/evidence/upload`, body, { headers: { 'Content-Type': undefined } })).data
}
export async function createHedDeliveryPackage(campaignId: string, value: HedDeliveryPackageInput) {
  return (await http.post<{ id: string; content: HedDeliveryPackage }>(`/v1/disbursement/campaigns/${campaignId}/evidence`, value)).data
}
export async function createHedOutcomePackage(campaignId: string, value: HedOutcomePackageInput) {
  return (await http.post<{ id: string }>(`/v1/disbursement/campaigns/${campaignId}/evidence`, value)).data
}
export interface HedVendorRequest { requestId: string; requestHash: `0x${string}`; vendorWallet: `0x${string}`; onchainCampaignId: string; onchainRequestId: string; content: HedRequestDraftInput }
export async function listHedVendorRequests(signal?: AbortSignal) {
  return (await http.get<HedVendorRequest[]>('/v1/disbursement/vendor/requests', { signal })).data
}
