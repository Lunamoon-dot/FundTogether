import { http } from './http'
import type { SubmissionPlan } from './campaign-submission'
import type { MilestoneAction } from '../../../../backend/src/modules/evidence/milestone-policy'

export interface PublicEvidenceManifest {
  summary: string
  outcomes: { criterionId: string; description: string; documentIndexes: number[] }[]
  documents: { id: string; name: string; mediaType: string; byteSize: number; sha256: string }[]
  privateCommitment: string
}
export interface EvidencePublication { hash: `0x${string}`; version?: number; packageId?: string; manifest: PublicEvidenceManifest }
export type MilestoneDetail = { supported: false; reason: string } | {
  supported: true; plan: SubmissionPlan; tokenDecimals: number; onchainCampaignId: string; state: number; currentMilestoneIndex: string; milestoneIndex: string
  version: number; evidenceHash: `0x${string}`; evidenceDeadline: string; admissionDeadline: string; reviewEnd: string; bondUnits: string
  dispute: { responseDeadline: string; resolutionDeadline: string; responseHash: string; resolution: number; challenger: string; reasonHash: string }
  checkedBlock: string; checkedBlockHash: `0x${string}`; chainTimestamp: string
  roles: { resolver: string; reviewer: boolean; conflict: boolean; organizerAccount: boolean; resolverAccount: boolean;
    wallets: { address: string; organizer: boolean; donor: boolean; reviewer: boolean }[] }
  publication: EvidencePublication | null; prepared: EvidencePublication[]; history: EvidencePublication[]
  records: { hash: string; unavailable?: boolean; action?: string; reason?: string; wallet?: string; version?: number }[]
  events: { name: string; hash: string; block: string; args: Record<string, string> }[]
}
export interface PreparedMilestoneAction {
  functionName: string; args: (string | number)[]; event: string; expected: Record<string, string>
  proof?: { event: string; expected: Record<string, string> }
  recordHash: string; checkedBlock: string; checkedBlockHash: `0x${string}`; contractAddress: `0x${string}`; wallet: string
}
const path = (id: string, index: string) => `/milestone-workflows/${id}/${index}`
export async function getMilestoneDetail(id: string, index: string, signal?: AbortSignal) {
  return (await http.get<MilestoneDetail>(path(id, index), { signal })).data
}
export async function prepareMilestoneAction(id: string, index: string, input: { action: MilestoneAction; wallet: string; expectedVersion: number;
  expectedEvidenceHash: string; reason: string; acknowledged: true; publicationHash?: string }) {
  return (await http.post<PreparedMilestoneAction>(`${path(id, index)}/prepare`, input)).data
}
export async function publishRedactedEvidence(id: string, index: string, input: { packageId: string; confirmedRedacted: true;
  summary: string; outcomes: PublicEvidenceManifest['outcomes'] }, files: File[]) {
  const form = new FormData(); form.append('input', JSON.stringify(input))
  for (const file of files) form.append('files', file)
  return (await http.post<EvidencePublication>(`${path(id, index)}/publication`, form,
    { headers: { 'Content-Type': undefined }, timeout: 120_000 })).data
}
async function verifiedDownload(url: string, expectedHash: string) {
  const blob = (await http.get<Blob>(url, { responseType: 'blob' })).data
  const hash = `0x${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')}`
  if (hash !== expectedHash.toLowerCase()) throw new Error('Tài liệu tải về không khớp commitment. Chưa thể dùng bản này để đánh giá.')
  return blob
}
export async function downloadMilestoneDocument(id: string, index: string, hash: string, documentId: string, expectedHash: string) {
  return verifiedDownload(`${path(id, index)}/documents/${hash}/${documentId}`, expectedHash)
}
export async function downloadPublicEvidenceManifest(id: string, index: string, hash: string) {
  return verifiedDownload(`${path(id, index)}/manifests/${hash}`, hash)
}
export async function getResolverOriginal(id: string, index: string) {
  return (await http.get<{ manifest: { documents: { documentId: string; originalName: string }[] } }>(`${path(id, index)}/original`)).data
}
export async function downloadResolverOriginal(id: string, index: string, doc: string) {
  return (await http.get<Blob>(`${path(id, index)}/original/${doc}`, { responseType: 'blob' })).data
}
export async function getMilestoneQueue(signal?: AbortSignal) {
  return (await http.get<{ items: { campaignId: string; title: string; index: string; state: number }[] }>('/milestone-workflows/review-queue', { signal })).data
}
