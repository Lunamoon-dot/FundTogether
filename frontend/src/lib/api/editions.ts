import { http } from './http';
import type { RewardCampaign } from './reward';

export interface EditionsDeployment {
  protocolKind: 'EDITIONS'; chainId: 31339; abiVersion: 'editions-local-v1'; abiHash: `0x${string}`;
  contractAddress: `0x${string}`; tokenAddress: `0x${string}`; resolver: `0x${string}`; backupResolver: `0x${string}`;
  genesisHash: `0x${string}`; contractCodeHash: `0x${string}`; policyHash: `0x${string}`;
}
export interface EditionsChain {
  deployment: EditionsDeployment; status: 'ON_CHAIN_CONFIRMED' | 'ORPHANED' | 'NOT_PUBLISHED'; onchainCampaignId: string | null;
  challenges: { backer: string; evidenceHash: string; resolved: boolean; upheld: boolean | null; decisionHash: string | null }[];
  snapshot: { creator: string; commitmentHash: string; goal: string; price: string; fundingDeadline: string; releaseDeadline: string;
    raised: string; escrowed: string; state: number; productionHash: string; productionApproved: boolean; pdfHash: string;
    releaseEvidenceHash: string; reviewRequestedAt: string; challengeDeadline: string; disputeDeadline: string; openDisputes: string } | null;
}
export interface EditionsTerms {
  deployment: EditionsDeployment; creatorWallet: `0x${string}`; commitmentHash: `0x${string}`; goal: string; price: string;
  fundingDuration: number; releaseDeadline: string; chainTimestamp: string;
}
export interface EditionsPreview {
  id: string; status: 'UNDER_REVIEW' | 'APPROVED'; commitmentHash: string; config: NonNullable<RewardCampaign['draftConfig']>;
  surface: 'REVIEW' | 'ACTIVATION_PENDING' | 'FUNDING'; reviewStartedAt: string | null; reviewDeadlineAt: string | null;
  reviewState: 'ACTIVE' | 'OVERDUE' | null;
  creatorDisplayName: string; contentOutline: string; budgetPlan: string; evidencePlan: string; feedbackCount: number;
  releaseWindow: { start: string; end: string }; evidenceHashes: string[];
  decisions: { outcome: string; commitmentHash: string; reviewedAt: string }[];
}
export interface EditionsEvidence {
  id: string; purpose: 'PRODUCTION_EVIDENCE' | 'FINAL_PDF'; sha256: string; mediaType: string; sizeBytes: number;
  summary: string; evidenceHash: string; productionHash: string; createdAt: string;
}
export interface EditionsFeedback { id: string; authorUserId: string; targetHash: string; kind: 'COMMENT' | 'ISSUE' | 'FILE_UNAVAILABLE'; body: string; createdAt: string }
export interface EditionsEntitlement { id: string; campaignId: string; backerWallet: string; transactionHash: string; amountPaid: string;
  access: 'DOWNLOAD_ELIGIBLE' | 'PENDING_RELEASE' | 'REFUND_ELIGIBLE' | 'REFUNDED' | 'ORPHANED'; confirmedAt: string | null }

const base = '/v1/reward/editions';
export const editionsApi = {
  list: async (signal?: AbortSignal) => (await http.get<EditionsPreview[]>('/v1/reward/public/editions/funding', { signal })).data,
  review: async (signal?: AbortSignal) => (await http.get<EditionsPreview[]>('/v1/reward/public/editions/review', { signal })).data,
  activation: async (signal?: AbortSignal) => (await http.get<EditionsPreview[]>('/v1/reward/public/editions/activation', { signal })).data,
  funding: async (signal?: AbortSignal) => (await http.get<EditionsPreview[]>('/v1/reward/public/editions/funding', { signal })).data,
  preview: async (id: string, signal?: AbortSignal) => (await http.get<EditionsPreview>(`/v1/reward/public/editions/${id}`, { signal })).data,
  deployment: async () => (await http.get<EditionsDeployment>(`${base}/deployment`)).data,
  chain: async (id: string, signal?: AbortSignal) => (await http.get<EditionsChain>(`${base}/campaigns/${id}/chain`, { signal })).data,
  terms: async (id: string) => (await http.get<EditionsTerms>(`${base}/campaigns/${id}/publication-terms`)).data,
  sync: async (txHash: string) => (await http.post<{ state: 'ON_CHAIN_CONFIRMED' }>(`${base}/sync-receipt`, { txHash })).data,
  evidence: async (id: string, privateView: boolean, signal?: AbortSignal) => (await http.get<EditionsEvidence[]>(privateView ? `${base}/campaigns/${id}/evidence` : `/v1/reward/public/editions/${id}/evidence`, { signal })).data,
  upload: async (id: string, purpose: EditionsEvidence['purpose'], summary: string, file: File) => {
    const data = new FormData(); data.append('purpose', purpose); data.append('summary', summary); data.append('file', file);
    return (await http.post<EditionsEvidence>(`${base}/campaigns/${id}/evidence`, data, { headers: { 'Content-Type': undefined }, timeout: 60000 })).data;
  },
  evidenceFile: async (id: string, fileId: string) => (await http.get<Blob>(`${base}/campaigns/${id}/evidence/${fileId}/file`, { responseType: 'blob' })).data,
  feedback: async (id: string, signal?: AbortSignal) => (await http.get<EditionsFeedback[]>(`${base}/campaigns/${id}/feedback`, { signal })).data,
  comment: async (id: string, data: { targetHash: string; kind: 'COMMENT' | 'ISSUE'; body: string }) => (await http.post<EditionsFeedback>(`${base}/campaigns/${id}/feedback`, data)).data,
  entitlements: async (signal?: AbortSignal) => (await http.get<EditionsEntitlement[]>(`${base}/entitlements`, { signal })).data,
  ticket: async (id: string) => (await http.post<{ state: 'DOWNLOAD_AVAILABLE'; url: string; expiresAt: string; sha256: string }>(`${base}/entitlements/${id}/download`, {})).data,
  download: async (url: string) => {
    if (!/^\/v1\/reward\/editions\/downloads\/[0-9a-f]{64}$/.test(url)) throw new Error('Liên kết tải không hợp lệ.');
    return (await http.get<Blob>(url, { responseType: 'blob' })).data;
  },
  confirm: async (id: string) => (await http.post(`${base}/entitlements/${id}/confirm`, {})).data,
};
