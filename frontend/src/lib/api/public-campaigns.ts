import type { SubmissionPlan } from './campaign-submission'
import { http } from './http'

export interface IndexerStatus {
  status: 'syncing' | 'ready' | 'error' | 'rebuilding'
  lastIndexedBlock: string | null
  headBlock: string | null
  error: string | null
}

export interface PublicCampaign {
  id: string
  title: string
  description: string | null
  organization: { id: string; name: string }
  chainId: number
  contractAddress: `0x${string}`
  onchainCampaignId: string
  organizer: `0x${string}`
  tokenAddress: `0x${string}`
  goalUnits: string
  requiredBondUnits: string
  bondAmountUnits: string
  totalContributedUnits: string
  state: string
  fundingDeadline: number
  publicationTransactionHash: string | null
  indexedBlock: string
  milestones: {
    index: number
    title: string
    description: string | null
    budgetUnits: string
    acceptanceCriteria: { criterionId: string; description: string }[]
  }[]
}

export type ReviewCampaign = PublicCampaign & { plan: SubmissionPlan }
export interface CampaignReview {
  decision: 'approve' | 'request_changes' | 'reject'
  reason: string
  reviewerUserId: string
  reviewerWallet: string
  revision: number
  dossierHash: string
  checkedBlock: string
  checkedBlockHash: string
  createdAt: string
}
export interface ReviewDetail {
  campaign: ReviewCampaign
  resolver: `0x${string}`
  sync: IndexerStatus
  review: CampaignReview | null
  dossierHash: string
  revision: number
  conflict: boolean
  canSign: boolean
  checks: { label: string; passed: boolean }[]
}
export interface PublicationStatus {
  review: CampaignReview | null
  state: string | null
  indexedBlock: string | null
  published: boolean
  publicId: string | null
  sync: IndexerStatus
}

export interface DonorContribution {
  id: string
  title: string
  organization: string
  donor: string
  amountUnits: string
  transactionHash: string
  blockNumber: string
  logIndex: number
}

export async function listMyContributions(signal?: AbortSignal) {
  const { data } = await http.get<{ items: DonorContribution[]; sync: IndexerStatus }>('/contributions', { signal })
  return data
}

export interface CampaignRefund {
  campaign: PublicCampaign
  snapshotted: boolean
  poolUnits: string
  releasedUnits: string
  snapshotTransactionHash: `0x${string}` | null
  checkedBlock: string
  checkedBlockHash: `0x${string}`
  chainTimestamp: string
  canFinalizeFunding: boolean
  currentMilestoneIndex: string
  milestoneDeadline: string
  canFinalizeMilestone: boolean
  wallets: { donor: string; contributionUnits: string; entitlementUnits: string; claimableUnits: string;
    claimed: boolean; transactionHash: `0x${string}` | null; blockNumber: string | null }[]
}

export interface CampaignWorkflow {
  milestoneMvp?: boolean
  caseDeadlines?: { responseDeadline: string; resolutionDeadline: string; resolver: string } | null
  activationTransactionHash: string | null
  checkedBlock: string
  checkedBlockHash: `0x${string}`
  chainTimestamp: string
  currentMilestoneIndex: string
  activationDeadline: string
  evidenceDeadline: string
  admissionDeadline: string
  reviewDeadline: string
  refundSnapshotted: boolean
  refundPoolUnits: string
  releasedUnits: string
}

export async function getMyRefunds(campaignId?: string, signal?: AbortSignal) {
  const { data } = await http.get<{ items: CampaignRefund[]; sync: IndexerStatus }>(campaignId ? `/refunds/${campaignId}` : '/refunds', { signal })
  return data
}

export async function listPublicCampaigns(offset = 0, signal?: AbortSignal) {
  const { data } = await http.get<{ items: PublicCampaign[]; sync: IndexerStatus }>('/public/campaigns', { params: { limit: 20, offset }, signal })
  return data
}

export async function getPublicCampaign(id: string, signal?: AbortSignal) {
  const { data } = await http.get<{ campaign: PublicCampaign; workflow: CampaignWorkflow; sync: IndexerStatus }>(`/public/campaigns/${id}`, { signal })
  if (!data.workflow) throw new Error('API chưa trả dữ liệu workflow mà trang campaign cần. Backend có thể đang chạy bản cũ; khởi động lại backend rồi tải lại trang. Chưa gửi giao dịch đóng góp.')
  return data
}

export async function getReviewAccess(signal?: AbortSignal) {
  const { data } = await http.get<{ allowed: boolean; staff: boolean; roles: string[]; canSign: boolean; resolver: `0x${string}` }>('/review/access', { signal })
  return data
}

export async function listReviewCampaigns(signal?: AbortSignal) {
  const { data } = await http.get<{ items: ReviewCampaign[]; history: (PublicCampaign & { review: CampaignReview })[]; resolver: `0x${string}`; sync: IndexerStatus }>('/review/campaigns', { signal })
  return data
}

export async function getReviewCampaign(id: string, signal?: AbortSignal) {
  const { data } = await http.get<ReviewDetail>(`/review/campaigns/${id}`, { signal })
  return data
}

export async function saveCampaignReview(id: string, input: { decision: CampaignReview['decision']; reason: string; expectedDossierHash: string }) {
  const { data } = await http.post<CampaignReview>(`/review/campaigns/${id}/decision`, input)
  return data
}

export async function authorizeCampaignApproval(id: string) {
  const { data } = await http.get<ReviewDetail>(`/review/campaigns/${id}/approval`)
  return data
}

export async function createCampaignRevision(id: string) {
  const { data } = await http.post<{ id: string; organizationId: string }>(`/campaigns/${id}/revision`)
  return data
}

export async function getPublication(id: string, signal?: AbortSignal) {
  const { data } = await http.get<PublicationStatus>(`/campaigns/${id}/publication`, { signal })
  return data
}
