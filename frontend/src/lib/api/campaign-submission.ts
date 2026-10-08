import { http } from './http';
export type { SubmissionPlan } from '../../../../backend/src/modules/campaigns/submission-plan';
import type { SubmissionPlan } from '../../../../backend/src/modules/campaigns/submission-plan';
export interface SubmissionStatus { plan: SubmissionPlan; stage: string; onchainCampaignId: string | null; bondLocked?: boolean; criteriaReady?: boolean; chainState?: number; confirmedBlock?: string }
export async function getSubmission(id: string) { const { data } = await http.get<SubmissionPlan | null>(`/campaigns/${id}/submission`); return data || null; }
export async function prepareSubmission(id: string, expectedRevision: number, fundingDeadline: number) {
  const { data } = await http.post<SubmissionPlan>(`/campaigns/${id}/submission`, { expectedRevision, fundingDeadline }); return data;
}
export async function syncSubmission(id: string) { const { data } = await http.post<SubmissionStatus>(`/campaigns/${id}/submission/sync`); return data; }
