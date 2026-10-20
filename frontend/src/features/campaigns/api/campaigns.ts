import { http } from '../../../lib/api/http';

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
  createdAt: string;
}

export interface CampaignDraftInput {
  mode: 'FUNDTOGETHER_V1';
  policyVersion: 'fundtogether-comic-download-mvp-v1';
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
    benefitItems: { type: 'DIGITAL_DOWNLOAD'; format: 'PDF'; title: string; description: string }[];
  }[];
}

export interface CampaignSample { id: string; sha256: string; mediaType: string; sizeBytes: number }
export interface CampaignPreparation {
  payoutWalletLinkId: string;
  sampleIds: string[];
  contentOutline: string;
  budgetPlan: string;
  evidencePlan: string;
}
export interface CampaignSnapshot {
  commitmentVersion: 'campaigns-review-v1';
  config: CampaignDraftInput;
  creator: { userId: string; profileId: string; displayName: string; ipDeclaration: string };
  payoutWallet: { linkId: string; address: string; chainId: string };
  preparation: Omit<CampaignPreparation, 'payoutWalletLinkId' | 'sampleIds'>;
  samples: CampaignSample[];
}

export interface Campaign {
  id: string;
  creatorUserId: string;
  title: string;
  pitch: string;
  story: string;
  category: 'COMICS_ARTBOOK' | 'COMICS' | 'ARTBOOK' | 'ILLUSTRATION' | 'OTHER';
  draftConfig: CampaignDraftInput | null;
  reviewPreparation?: CampaignPreparation | null;
  frozenSnapshot?: CampaignSnapshot | null;
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
    | 'UNDER_REVIEW_PRIVATE'
    | 'COMMUNITY_REVIEW'
    | 'APPROVED'
    | 'PUBLISHED'
    | 'ACTIVE'
    | 'PRODUCTION_VERIFIED'
    | 'FULFILLMENT_COMPLETE'
    | 'COMPLETED'
    | 'STOPPED'
    | 'CHANGES_REQUESTED'
    | 'REJECTED';
  frozenAt: string | null;
  createdAt: string;
  updatedAt: string;
  tiers: CampaignTier[];
  projection?: Record<string, any> | null;
}

export interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  ipDeclaration: string;
  primaryGenre?: string | null;
  portfolioUrl?: string | null;
  socialUrl?: string | null;
  contactEmail?: string | null;
  originalWorkPledge?: boolean | null;
  studioWalletLinkId: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorVerificationInput {
  studioWalletLinkId: string | null;
  displayName: string;
  bio: string;
  ipDeclaration: string;
  primaryGenre?: string | null;
  portfolioUrl?: string | null;
  socialUrl?: string | null;
  contactEmail?: string | null;
  originalWorkPledge: true;
}

export interface DeploymentManifest {
  protocolKind: 'CAMPAIGNS'; chainId: 31339; abiVersion: 'campaigns-local-judge-v1'; abiHash: `0x${string}`;
  contractAddress: `0x${string}`; tokenAddress: `0x${string}`; resolver: `0x${string}`; backupResolver: `0x${string}`; judges: `0x${string}`[];
  genesisHash: `0x${string}`; contractCodeHash: `0x${string}`; policyHash: `0x${string}`;
}
export interface VNextDeployment {
  configured: boolean;
  protocolKind?: 'FUNDTOGETHER_VNEXT';
  chainId?: 31339;
  rpcUrl?: string;
  abiVersion?: string;
  abiHash?: `0x${string}`;
  tokenDecimals?: 6;
  confirmations?: 1;
  campaignEscrow?: `0x${string}`;
  juryRegistry?: `0x${string}`;
  juryReview?: `0x${string}`;
  randomnessProvider?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  policyHash?: `0x${string}`;
  genesisHash?: `0x${string}`;
  campaignCodeHash?: `0x${string}`;
  registryCodeHash?: `0x${string}`;
  reviewCodeHash?: `0x${string}`;
  tokenCodeHash?: `0x${string}`;
  deploymentBlockNumber?: string;
  deploymentBlockHash?: `0x${string}`;
}
export interface VNextTransactionStatus {
  txHash: `0x${string}`;
  state: 'INDEXING' | 'ON_CHAIN_CONFIRMED';
  eventCount: number;
}
export interface VNextIndexerStatus {
  configured: boolean;
  streamId?: string;
  status?: string;
  lastBlock?: string | null;
  lastBlockHash?: string | null;
  headBlock?: string | null;
  lagBlocks?: string | null;
  error?: string | null;
  updatedAt?: string | null;
}
export interface VNextCampaignProjection {
  streamId: string;
  onchainCampaignId: string;
  creator: string;
  payoutWallet: string;
  termsHash: string;
  publicationEvidenceHash: string | null;
  publicationReviewCaseId: string | null;
  publicationOutcome: number | null;
  policyVersion: string;
  goal: string;
  fundingDeadline: string;
  raised: string;
  paidOut: string;
  refunded: string;
  state: number;
  lastBlockNumber: string;
  lastEventName: string;
}
export interface VNextMilestoneProjection {
  milestoneId: number;
  evidenceRevision: string;
  evidenceHash: string | null;
  reviewCaseId: string | null;
  finalOutcome: number | null;
  challengeDeadline?: string | null;
  correctionDeadline?: string | null;
  state: number;
  paid: boolean;
}
export interface VNextJudgeAssignment {
  reviewCaseId: string;
  roundId: string;
  courtId: string;
  slot: number;
  judgeAddress: string;
}
export interface VNextAssignedReview {
  streamId: string;
  reviewCaseId: string;
  rootCaseId: string;
  campaignId: string;
  milestoneId: string;
  evidenceRevision: string;
  roundId: string;
  creator: string;
  enrolledCount: string;
  courtCount?: string;
  finalizedCourtCount?: string;
  passCourts?: string;
  failCourts?: string;
  outcome: number | null;
  finalized: boolean;
  lastBlockNumber: string;
  assignments: VNextJudgeAssignment[];
}
export type VNextReviewWithAssignments = VNextAssignedReview;
export interface VNextBackerProjection {
  streamId: string;
  onchainCampaignId: string;
  backerAddress: string;
  contributed: string;
  refundEntitlement: string;
  refundClaimed: boolean;
  refundAllocationsFrozen: boolean;
  indexedContributed: string;
  indexedRefunded: string;
  lastBlockNumber: string;
}
export interface VNextChallengeProjection {
  streamId: string;
  onchainCampaignId: string;
  milestoneId: number;
  challengeCaseId: string;
  challenger: string;
  evidenceHash: string;
  outcome: number | null;
  lastBlockNumber: string;
}
export interface VNextJudgeLedgerProjection {
  streamId: string;
  reviewCaseId: string;
  judgeAddress: string;
  reserved: string;
  released: string;
  settled: string;
  caseSlashed: string;
  rewardAccrued: string;
  rewardClaimed: string;
  lastBlockNumber: string;
}
export interface VNextCaseEvidence {
  reviewCaseId: string;
  evidenceHash: string;
  sha256: string;
  mediaType: string;
  sizeBytes: number;
  summary: string;
  createdAt: string;
  availability?: 'AVAILABLE' | 'MISSING' | 'UNAVAILABLE';
}
export interface VNextCaseEvidenceResponse {
  access: 'CREATOR' | 'JUDGE' | 'CHALLENGER';
  assignments: VNextJudgeAssignment[];
  evidence: VNextCaseEvidence[];
  canonicalEvidenceHash: string | null;
  availabilityPolicy: {
    reviewCaseId: string;
    reviewPhase: 'ENROLLMENT' | 'VOTING' | 'FINALIZED';
    status: 'READY' | 'WAITING_FOR_EVIDENCE' | 'TIMEOUT_RETRY_ELIGIBLE' | 'WAITING_FOR_INDEXER' | 'REVIEW_CLOSED';
    timeoutAtSeconds: string | null;
  };
}
export interface VNextEvidenceAccessTicket { state: 'EVIDENCE_AVAILABLE'; url: string; expiresAt: string; sha256: string; }
export interface CampaignChain {
  deployment: DeploymentManifest; status: 'ON_CHAIN_CONFIRMED' | 'ORPHANED' | 'NOT_PUBLISHED'; onchainCampaignId: string | null;
  bindingTransactionHash: `0x${string}` | null;
  chainTimestamp: string;
  challenges: { backer: string; evidenceHash: string; resolved: boolean; upheld: boolean | null; decisionHash: string | null }[];
  snapshot: { creator: string; commitmentHash: string; goal: string; price: string; fundingDeadline: string; releaseDeadline: string;
    raised: string; escrowed: string; state: number; productionHash: string; productionApproved: boolean; pdfHash: string;
    releaseEvidenceHash: string; reviewRequestedAt: string; challengeDeadline: string; disputeDeadline: string; openDisputes: string;
    payoutRequestHash: string; payoutAmount: string; payoutRequestedAt: string; payoutDecisionHash: string; creatorPaid: string;
    completionRequestHash: string; completionRequestedAt: string; completionDecisionHash: string; completionRaised: string;
    surplusPool: string; surplusClaimed: string; backerCount: string; surplusClaimantCount: string } | null;
}
export interface OperationSummary {
  campaignId: string;
  title: string;
  creatorUserId: string;
  applicationStatus: Campaign['status'];
  publicationStatus: CampaignChain['status'];
  onchainCampaignId: string | null;
  contractState: number | null;
  snapshot: CampaignChain['snapshot'];
  bindingTransactionHash: `0x${string}` | null;
  publicationCase: PublicationJudgeCase | null;
}
export type CampaignTransactionAction =
  | 'createPublicationCase' | 'votePublicationCase' | 'expirePublicationCase' | 'createCampaign' | 'pledge' | 'submitProduction' | 'submitRelease'
  | 'reviewProduction' | 'confirmCampaignCompletion' | 'reviewRelease' | 'challengeRelease' | 'resolveChallenge'
  | 'finalizeFunding' | 'startRefunds' | 'claimRefund' | 'requestCompletion' | 'approveCompletion' | 'rejectCompletion' | 'claimSurplus' | 'cancelCampaign'
  | 'requestDisbursement' | 'approveDisbursement' | 'rejectDisbursement';
export type SyncState = 'PENDING' | 'REVERTED' | 'UNRELATED' | 'INDEXING' | 'ON_CHAIN_CONFIRMED';
export interface CampaignTerms {
  deployment: DeploymentManifest; creatorWallet: `0x${string}`; commitmentHash: `0x${string}`; goal: string; price: string;
  fundingDuration: number; chainTimestamp: string; onchainApproved: boolean; publicationCase: PublicationJudgeCase | null;
}
export interface PublicationJudgeCase {
  caseId: string; creator: string; commitmentHash: string; termsHash: string; voteDeadline: string; selectionSeed: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'EXPIRED'; judges: string[];
  votes: { judge: string; approved: boolean }[]; approveVotes: number; rejectVotes: number; decisionHash: string | null;
}
export interface CampaignPreview {
  id: string; status: 'COMMUNITY_REVIEW' | 'APPROVED' | 'PUBLISHED'; commitmentHash: string; config: NonNullable<Campaign['draftConfig']>;
  surface: 'REVIEW' | 'ACTIVATION_PENDING' | 'ORPHANED' | 'FUNDING' | 'FUNDED'; chainState?: number | null; reviewStartedAt: string | null;
  creatorDisplayName: string; contentOutline: string; budgetPlan: string; evidencePlan: string; feedbackCount: number;
  evidenceHashes: string[];
  decisions: { outcome: string; commitmentHash: string; reviewedAt: string }[];
}
export interface Evidence {
  id: string; purpose: 'PRODUCTION_EVIDENCE' | 'FINAL_PDF'; sha256: string; mediaType: string; sizeBytes: number;
  summary: string; evidenceHash: string; productionHash: string; createdAt: string;
}
export interface CampaignCompletionFile { id: string; originalName: string; mediaType: string; sizeBytes: number; sha256: string; createdAt: string; downloadPath: string }
export interface CampaignCompletionDecision { id: string; outcome: 'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'; reason: string; decisionHash: string; txHash: string | null; resolverUserId: string; createdAt: string }
export interface CampaignCompletionRequest {
  id: string; campaignId: string; streamId: string; commitmentHash: string; revision: number; requestHash: string;
  title: string; summary: string; reason: string;
  status: 'DRAFT' | 'SUBMITTED_ON_CHAIN' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED';
  requestTxHash: string | null; requestedAt: string | null; decisionHash: string | null; decisionTxHash: string | null;
  createdAt: string; updatedAt: string; files: CampaignCompletionFile[]; decisions: CampaignCompletionDecision[];
}
export interface CampaignPayoutFile { id: string; purpose: 'USE_EXPLANATION' | 'PREVIOUS_USE_EVIDENCE'; originalName: string; mediaType: string; sizeBytes: number; sha256: string; createdAt: string; downloadPath: string }
export interface CampaignPayoutDecision { id: string; outcome: 'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'; reason: string; decisionHash: string; txHash: string | null; resolverUserId: string; createdAt: string }
export interface CampaignPayoutRequest {
  id: string; campaignId: string; streamId: string; commitmentHash: string; revision: number; requestHash: string; amount: string;
  title: string; summary: string; reason: string; breakdown: string;
  status: 'DRAFT' | 'SUBMITTED_ON_CHAIN' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'APPROVED' | 'PAID_OUT';
  requestTxHash: string | null; requestedAt: string | null; decisionHash: string | null; decisionTxHash: string | null; paidOutTxHash: string | null;
  createdAt: string; updatedAt: string; files: CampaignPayoutFile[]; decisions: CampaignPayoutDecision[];
}
export interface CampaignSurplusClaim { id: string; campaignId: string; backerWallet: string; choice: 'REFUND_TO_BACKER' | 'DONATE_TO_CREATOR'; recipient: string; amount: string; transactionHash: string; blockNumber: string; createdAt: string }
export interface Feedback { id: string; authorUserId: string; targetHash: string; kind: 'COMMENT' | 'ISSUE' | 'FILE_UNAVAILABLE'; body: string; createdAt: string }
export interface CreatorResponse { id: string; campaignId: string; creatorUserId: string; submissionRevision: number; commitmentHash: string; responseBody: string; createdAt: string; relatedFeedbackIds: string[] }
export interface FeedbackResponse { items: Feedback[]; history?: Feedback[]; responses?: CreatorResponse[]; canSubmit: boolean; canRespond?: boolean }
export interface ReviewMessage { id: string; threadId: string; authorUserId: string; authorRole: 'BACKER' | 'CREATOR' | 'RESOLVER'; body: string; createdAt: string }
export interface ReviewEscalation { id: string; threadId: string; openerUserId: string; reason: string; status: 'OPEN' | 'AWAITING_CREATOR_RESPONSE' | 'RESOLVED' | 'DISMISSED' | 'FORMAL_DISPUTE'; resolverUserId: string | null; outcome: 'RESOLVED' | 'DISMISSED' | 'FORMAL_DISPUTE' | null; note: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null }
export interface ReviewThreadPermissions { canMessage: boolean; canEscalate: boolean; readOnlyReason: 'REFUNDED' | 'ORPHANED' | 'CLOSED' | 'RESOLVED' | null }
export interface ReviewThread { id: string; campaignId: string; entitlementId: string; backerUserId: string; creatorUserId: string; targetHash: string; commitmentHash: string; status: 'OPEN' | 'ESCALATED' | 'RESOLVED' | 'CLOSED'; createdAt: string; updatedAt: string; permissions: ReviewThreadPermissions; messages: ReviewMessage[]; hasMore?: boolean; nextCursor?: string | null; escalation: ReviewEscalation | null }
export interface ResolverCase {
  id: string; status: ReviewEscalation['status']; escalation: ReviewEscalation; thread: ReviewThread;
  campaign: { id: string; title: string; pitch: string; commitmentHash: string | null; frozenSnapshot: unknown };
  chain: { status: CampaignChain['status']; onchainCampaignId: string | null; snapshot: CampaignChain['snapshot']; challenges: CampaignChain['challenges'] };
  entitlement: { id: string; backerUserId: string | null; backerWallet: string; amountPaid: string; canonical: boolean; refunded: boolean; streamId: string; transactionHash: string; blockNumber: string } | null;
  feedback: Feedback[];
}
export interface Entitlement { id: string; campaignId: string; campaignTitle: string; backerWallet: string; transactionHash: string; amountPaid: string; quantity: string;
  access: 'DOWNLOAD_ELIGIBLE' | 'DELIVERY_UNAVAILABLE' | 'PENDING_RELEASE' | 'REFUND_ELIGIBLE' | 'REFUNDED' | 'ORPHANED'; confirmedAt: string | null }

const base = '/v1/fundtogether/campaigns';
const fundtogetherBase = '/v1/fundtogether';
const campaignPath = (id: string) => `${base}/campaigns/${id}`;

export async function listWallets(signal?: AbortSignal) {
  return (await http.get<{ id: string; address: string; chainId: string }[]>(`${base}/wallets`, { signal })).data;
}

export async function listTransactionWallets(signal?: AbortSignal) {
  return (await http.get<{ id: string; address: string; chainId: string }[]>(`${base}/wallets/transaction`, { signal })).data;
}

export async function listSamples(id: string, signal?: AbortSignal) {
  return (await http.get<CampaignSample[]>(`${campaignPath(id)}/samples`, { signal })).data;
}

export async function uploadSample(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return (await http.post<CampaignSample>(`${campaignPath(id)}/samples`, body, { headers: { 'Content-Type': undefined } })).data;
}

export async function getSample(id: string, sampleId: string) {
  return (await http.get<Blob>(`${campaignPath(id)}/samples/${sampleId}`, { responseType: 'blob' })).data;
}

export async function updatePreparation(id: string, data: { revision: number; config: CampaignDraftInput; preparation: CampaignPreparation }) {
  return (await http.patch<Campaign>(campaignPath(id), data)).data;
}

export async function freezeCampaign(id: string, revision: number) {
  return (await http.post<Campaign>(`${campaignPath(id)}/freeze`, { revision })).data;
}

export async function submitCampaignReview(id: string, revision: number, input: { responseBody?: string; relatedFeedbackIds?: string[] } = {}) {
  return (await http.post<Campaign>(`${campaignPath(id)}/submit-review`, { revision, ...input })).data;
}

export async function createCampaignDraft(data: CampaignDraftInput) {
  return (await http.post<Campaign>('/v1/fundtogether/creator/campaigns', data)).data;
}

export async function listCreatorCampaigns(signal?: AbortSignal) {
  return (await http.get<Campaign[]>('/v1/fundtogether/creator/campaigns/mine', { signal })).data;
}

export async function applyCreatorVerification(data: CreatorVerificationInput) {
  return (await http.post<CreatorProfile>('/v1/fundtogether/creator/profile', data)).data;
}

export async function getCreatorProfile(signal?: AbortSignal) {
  return (await http.get<CreatorProfile | null>('/v1/fundtogether/creator/profile', { signal })).data;
}

export async function listAdminCreatorProfiles(signal?: AbortSignal) {
  return (await http.get<CreatorProfile[]>('/v1/fundtogether/admin/creators', { signal })).data;
}

export async function listResolverCampaigns(signal?: AbortSignal) {
  return (await http.get<Campaign[]>('/v1/fundtogether/resolver/campaigns', { signal })).data;
}

export const campaignApi = {
  list: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/funding', { signal })).data,
  review: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/review', { signal })).data,
  activation: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/activation', { signal })).data,
  orphaned: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/orphaned', { signal })).data,
  funded: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/funded', { signal })).data,
  funding: async (signal?: AbortSignal) => (await http.get<CampaignPreview[]>('/v1/fundtogether/public/campaigns/funding', { signal })).data,
  preview: async (id: string, signal?: AbortSignal) => (await http.get<CampaignPreview>(`/v1/fundtogether/public/campaigns/${id}`, { signal })).data,
  deployment: async () => (await http.get<DeploymentManifest>(`${base}/deployment`)).data,
  vnextDeployment: async () => (await http.get<VNextDeployment>('/v1/fundtogether/vnext/deployment')).data,
  vnextIndexer: async (signal?: AbortSignal) => (await http.get<VNextIndexerStatus>('/v1/fundtogether/vnext/indexer', { signal })).data,
  vnextCampaign: async (id: string, signal?: AbortSignal) => (await http.get<VNextCampaignProjection>(`/v1/fundtogether/vnext/campaigns/${id}`, { signal })).data,
  vnextMilestones: async (id: string, signal?: AbortSignal) => (await http.get<VNextMilestoneProjection[]>(`/v1/fundtogether/vnext/campaigns/${id}/milestones`, { signal })).data,
  vnextBackerPosition: async (id: string, signal?: AbortSignal) => (await http.get<VNextBackerProjection[]>(`/v1/fundtogether/vnext/campaigns/${id}/backer`, { signal })).data,
  vnextChallenges: async (id: string, signal?: AbortSignal) => (await http.get<VNextChallengeProjection[]>(`/v1/fundtogether/vnext/campaigns/${id}/challenges`, { signal })).data,
  vnextReviews: async (signal?: AbortSignal) => (await http.get<VNextReviewWithAssignments[]>('/v1/fundtogether/vnext/reviews', { signal })).data,
  vnextAssignedReviews: async (signal?: AbortSignal) => (await http.get<VNextReviewWithAssignments[]>('/v1/fundtogether/vnext/reviews/assigned', { signal })).data,
  vnextJudgeLedger: async (signal?: AbortSignal) => (await http.get<VNextJudgeLedgerProjection[]>('/v1/fundtogether/vnext/judge-ledger', { signal })).data,
  vnextEvidence: async (reviewCaseId: string, signal?: AbortSignal) => (await http.get<VNextCaseEvidenceResponse>(`/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/evidence`, { signal })).data,
  vnextUploadEvidence: async (reviewCaseId: string, summary: string, file: File) => {
    const data = new FormData(); data.append('summary', summary); data.append('file', file);
    return (await http.post<VNextCaseEvidence>(`/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/evidence`, data, { headers: { 'Content-Type': undefined }, timeout: 60000 })).data;
  },
  vnextEvidenceTicket: async (reviewCaseId: string, evidenceHash: string) => (await http.post<VNextEvidenceAccessTicket>(`/v1/fundtogether/vnext/reviews/${encodeURIComponent(reviewCaseId)}/evidence/${encodeURIComponent(evidenceHash)}/ticket`)).data,
  vnextTransaction: async (txHash: string, signal?: AbortSignal) => (await http.get<VNextTransactionStatus>(`/v1/fundtogether/vnext/transactions/${txHash}`, { signal })).data,
  chain: async (id: string, signal?: AbortSignal) => (await http.get<CampaignChain>(`${base}/campaigns/${id}/chain`, { signal })).data,
  operations: async (scope: 'creator' | 'judge' | 'resolver' | 'admin', signal?: AbortSignal) =>
    (await http.get<OperationSummary[]>(`${base}/operations/${scope}`, { signal })).data,
  terms: async (id: string) => (await http.get<CampaignTerms>(`${base}/campaigns/${id}/publication-terms`)).data,
  publicationCase: async (id: string, signal?: AbortSignal) => (await http.get<PublicationJudgeCase | null>(`${base}/campaigns/${id}/publication-case`, { signal })).data,
  sync: async (txHash: string, campaignId: string, action: CampaignTransactionAction) =>
    (await http.post<{ txHash: string; state: SyncState }>(`${base}/sync-receipt`, { txHash, campaignId, action })).data,
  evidence: async (id: string, privateView: boolean, signal?: AbortSignal) => (await http.get<Evidence[]>(privateView ? `${base}/campaigns/${id}/evidence` : `/v1/fundtogether/public/campaigns/${id}/evidence`, { signal })).data,
  upload: async (id: string, purpose: Evidence['purpose'], summary: string, file: File) => {
    const data = new FormData(); data.append('purpose', purpose); data.append('summary', summary); data.append('file', file);
    return (await http.post<Evidence>(`${base}/campaigns/${id}/evidence`, data, { headers: { 'Content-Type': undefined }, timeout: 60000 })).data;
  },
  evidenceFile: async (id: string, fileId: string) => (await http.get<Blob>(`${base}/campaigns/${id}/evidence/${fileId}/file`, { responseType: 'blob' })).data,
  completionRequests: async (id: string, signal?: AbortSignal) => (await http.get<CampaignCompletionRequest[]>(`${fundtogetherBase}/campaigns/${id}/completion-requests`, { signal })).data,
  createCompletionRequest: async (id: string, input: { title: string; summary: string; reason: string; files: File[] }) => {
    const data = new FormData();
    data.append('title', input.title); data.append('summary', input.summary); data.append('reason', input.reason);
    input.files.forEach(file => data.append('files', file));
    return (await http.post<CampaignCompletionRequest>(`${fundtogetherBase}/campaigns/${id}/completion-requests`, data, { headers: { 'Content-Type': undefined }, timeout: 60000 })).data;
  },
  completionFile: async (campaignId: string, requestId: string, fileId: string) => (await http.get<Blob>(`${fundtogetherBase}/campaigns/${campaignId}/completion-requests/${requestId}/files/${fileId}`, { responseType: 'blob' })).data,
  prepareCompletionDecision: async (requestId: string, data: { outcome: 'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'; reason: string }) =>
    (await http.post<CampaignCompletionDecision>(`${fundtogetherBase}/completion-requests/${requestId}/decisions`, data)).data,
  payoutRequests: async (id: string, signal?: AbortSignal) => (await http.get<CampaignPayoutRequest[]>(`${fundtogetherBase}/campaigns/${id}/payout-requests`, { signal })).data,
  createPayoutRequest: async (id: string, input: { amount: string; title: string; summary: string; reason: string; breakdown: string; explanationFiles: File[]; evidenceFiles?: File[] }) => {
    const data = new FormData();
    data.append('amount', input.amount); data.append('title', input.title); data.append('summary', input.summary); data.append('reason', input.reason); data.append('breakdown', input.breakdown);
    input.explanationFiles.forEach(file => data.append('explanationFiles', file));
    (input.evidenceFiles ?? []).forEach(file => data.append('evidenceFiles', file));
    return (await http.post<CampaignPayoutRequest>(`${fundtogetherBase}/campaigns/${id}/payout-requests`, data, { headers: { 'Content-Type': undefined }, timeout: 60000 })).data;
  },
  payoutFile: async (campaignId: string, requestId: string, fileId: string) => (await http.get<Blob>(`${fundtogetherBase}/campaigns/${campaignId}/payout-requests/${requestId}/files/${fileId}`, { responseType: 'blob' })).data,
  preparePayoutDecision: async (requestId: string, data: { outcome: 'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'; reason: string }) =>
    (await http.post<CampaignPayoutDecision>(`${fundtogetherBase}/payout-requests/${requestId}/decisions`, data)).data,
  surplusClaims: async (id: string, signal?: AbortSignal) => (await http.get<CampaignSurplusClaim[]>(`${fundtogetherBase}/campaigns/${id}/surplus-claims`, { signal })).data,
  feedback: async (id: string, signal?: AbortSignal) => (await http.get<FeedbackResponse>(`${base}/campaigns/${id}/feedback`, { signal })).data,
  comment: async (id: string, data: { targetHash: string; kind: 'COMMENT' | 'ISSUE'; body: string }) => (await http.post<Feedback>(`${base}/campaigns/${id}/feedback`, data)).data,
  creatorResponse: async (id: string, data: { responseBody: string; relatedFeedbackIds?: string[] }) =>
    (await http.post<CreatorResponse>(`${base}/campaigns/${id}/feedback/responses`, { relatedFeedbackIds: [], ...data })).data,
  reviewThreads: async (id: string, signal?: AbortSignal, cursor?: string) => (await http.get<ReviewThread[]>(`${base}/campaigns/${id}/review-threads`, { signal, params: cursor ? { cursor } : undefined })).data,
  reviewThread: async (threadId: string, signal?: AbortSignal, cursor?: string) => (await http.get<ReviewThread>(`${base}/review-threads/${threadId}`, { signal, params: cursor ? { cursor } : undefined })).data,
  openReviewThread: async (id: string, data: { targetHash: string; body: string }) => (await http.post<ReviewThread>(`${base}/campaigns/${id}/review-threads`, data)).data,
  messageReviewThread: async (threadId: string, body: string) => (await http.post<ReviewMessage>(`${base}/review-threads/${threadId}/messages`, { body })).data,
  escalateReviewThread: async (threadId: string, reason: string) => (await http.post<ReviewEscalation>(`${base}/review-threads/${threadId}/escalate`, { reason })).data,
  resolverCases: async (signal?: AbortSignal) => (await http.get<ResolverCase[]>(`${base}/resolver/review-cases`, { signal })).data,
  resolverCase: async (escalationId: string, signal?: AbortSignal) => (await http.get<ResolverCase>(`${base}/resolver/review-cases/${escalationId}`, { signal })).data,
  requestCreatorResponse: async (escalationId: string, body: string) => (await http.post<ReviewMessage>(`${base}/review-escalations/${escalationId}/request-creator-response`, { body })).data,
  resolveReviewEscalation: async (escalationId: string, outcome: 'RESOLVED' | 'DISMISSED' | 'FORMAL_DISPUTE', note: string) => (await http.post<ReviewEscalation>(`${base}/review-escalations/${escalationId}/resolve`, { outcome, note })).data,
  entitlements: async (signal?: AbortSignal) => (await http.get<Entitlement[]>(`${base}/entitlements`, { signal })).data,
  ticket: async (id: string) => (await http.post<{ state: 'DOWNLOAD_AVAILABLE'; url: string; expiresAt: string; sha256: string }>(`${base}/entitlements/${id}/download`, {})).data,
  download: async (url: string) => {
    if (!/^\/v1\/fundtogether\/campaigns\/downloads\/[0-9a-f]{64}$/.test(url)) throw new Error('Liên kết tải không hợp lệ.');
    return (await http.get<Blob>(url, { responseType: 'blob' })).data;
  },
  confirm: async (id: string) => (await http.post(`${base}/entitlements/${id}/confirm`, {})).data,
};
