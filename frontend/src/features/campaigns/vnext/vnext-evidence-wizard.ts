import type { VNextCaseEvidenceResponse, VNextMilestoneProjection } from '../api/campaigns';

export const MAX_VNEXT_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const VNEXT_EVIDENCE_MEDIA_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export const vnextEvidenceWizardStatuses = [
  'NOT_STARTED',
  'HASHING',
  'READY_TO_SUBMIT',
  'WALLET_CONFIRMATION',
  'TRANSACTION_SUBMITTED',
  'RECEIPT_CONFIRMED',
  'WAITING_FOR_INDEXER',
  'UPLOADING',
  'VERIFYING_AVAILABILITY',
  'READY',
  'ACTION_REQUIRED',
  'FAILED',
] as const;

export type VNextEvidenceWizardStatus = (typeof vnextEvidenceWizardStatuses)[number];

export interface VNextEvidenceFileLike {
  name: string;
  size: number;
  type: string;
}
export interface VNextEvidenceSelection<TFile extends VNextEvidenceFileLike = File> {
  file: TFile;
  evidenceHash: `0x${string}` | null;
  confirmed: boolean;
}

export interface VNextEvidenceSubmissionGuard {
  wallet?: string;
  creator: string;
  campaignState: number;
  milestoneState: number;
  chainTimestamp: bigint;
  submissionDeadline: bigint;
  correctionDeadline: bigint;
}

const supportedMilestoneStates = new Set([0, 11, 12]);

export function validateVNextEvidenceFile(file: VNextEvidenceFileLike): string | null {
  if (!VNEXT_EVIDENCE_MEDIA_TYPES.includes(file.type as (typeof VNEXT_EVIDENCE_MEDIA_TYPES)[number])) {
    return 'Chỉ chấp nhận PDF, PNG hoặc JPEG.';
  }
  if (file.size < 1 || file.size > MAX_VNEXT_EVIDENCE_BYTES) {
    return 'Evidence phải có kích thước từ 1 byte đến 10 MiB.';
  }
  return null;
}

export function selectVNextEvidenceFile<TFile extends VNextEvidenceFileLike>(file: TFile): VNextEvidenceSelection<TFile> {
  const error = validateVNextEvidenceFile(file);
  if (error) throw new Error(error);
  return { file, evidenceHash: null, confirmed: false };
}

export async function sha256VNextEvidence(bytes: ArrayBuffer | Uint8Array): Promise<`0x${string}`> {
  const input = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes).buffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export async function hashVNextEvidenceFile(file: Pick<File, 'arrayBuffer'>): Promise<`0x${string}`> {
  return sha256VNextEvidence(await file.arrayBuffer());
}

export function vnextEvidenceSubmissionBlockReason(input: VNextEvidenceSubmissionGuard): string | null {
  if (!input.wallet) return 'Kết nối ví Creator trên chain 31339.';
  if (input.wallet.toLowerCase() !== input.creator.toLowerCase()) return 'Chỉ Creator canonical của campaign được submit evidence.';
  if (input.campaignState !== 3) return 'Campaign chưa ở trạng thái MILESTONES_RUNNING.';
  if (!supportedMilestoneStates.has(input.milestoneState)) return 'Milestone đang có review active hoặc không còn cho phép submission.';
  if (input.milestoneState === 0 && input.submissionDeadline > 0n && input.chainTimestamp >= input.submissionDeadline) {
    return 'Milestone submission deadline đã hết.';
  }
  if (input.milestoneState === 11 && input.correctionDeadline > 0n && input.chainTimestamp >= input.correctionDeadline) {
    return 'Milestone correction deadline đã hết.';
  }
  return null;
}

export function isVNextEvidenceSubmissionState(state: number): boolean {
  return supportedMilestoneStates.has(state);
}

export function matchVNextCanonicalSubmission(milestones: VNextMilestoneProjection[], milestoneId: number, evidenceHash: string, expectedRevision: string): VNextMilestoneProjection | null {
  return (
    milestones.find((item) => item.milestoneId === milestoneId && item.evidenceRevision === expectedRevision && item.evidenceHash?.toLowerCase() === evidenceHash.toLowerCase() && /^0x[0-9a-fA-F]{64}$/.test(item.reviewCaseId ?? '')) ?? null
  );
}

export function isVNextEvidenceReady(response: VNextCaseEvidenceResponse | undefined, expectedHash: string): boolean {
  if (!response || response.canonicalEvidenceHash?.toLowerCase() !== expectedHash.toLowerCase()) return false;
  if (response.availabilityPolicy.status !== 'READY') return false;
  return response.evidence.some((item) => item.evidenceHash.toLowerCase() === expectedHash.toLowerCase() && item.sha256.toLowerCase() === expectedHash.toLowerCase() && item.availability === 'AVAILABLE');
}

export function canSendVNextEvidenceTransaction(input: { evidenceHash: string | null; confirmed: boolean; preflightReady: boolean; submittedTxHash?: string }): boolean {
  return Boolean(input.evidenceHash && input.confirmed && input.preflightReady && !input.submittedTxHash);
}
