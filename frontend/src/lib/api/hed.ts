import { http } from './http'

export interface HedCampaignDraftInput {
  title: string; description: string; purpose: string; beneficiaryScope: string; allowedExpenseCategories: string[];
  outcomeCriteria: string[]; goal: string; fundingDuration: number; policyHash: `0x${string}`
}
export interface HedCampaignDraft extends HedCampaignDraftInput {
  id: string; organizationId: string; commitmentHash: string | null; frozenAt: string | null
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
