import { bytesToHex, encodeAbiParameters, isAddress, keccak256 } from 'viem';
import type { VNextTransactionStage } from './vnext-actions';

export type VNextJudgeVote = 'PASS' | 'FAIL';

export interface VNextJudgeSecret {
  vote: VNextJudgeVote;
  salt: `0x${string}`;
}

export interface VNextJudgeSecretContext {
  chainId: number;
  reviewCaseId: string;
  courtId: bigint;
  judgeAddress: string;
}

export interface VNextVoteCommitmentInput {
  chainId: bigint;
  protocolVersion: bigint;
  campaignId: bigint;
  milestoneId: bigint;
  evidenceRevision: bigint;
  reviewCaseNumber: bigint;
  roundId: bigint;
  courtId: bigint;
  judgeAddress: `0x${string}`;
  vote: VNextJudgeVote;
  salt: `0x${string}`;
}

export interface VNextJudgeCaseStateInput {
  rpcAvailable: boolean;
  chainTimestamp?: bigint;
  roundStatus?: number;
  enrollmentDeadline?: bigint;
  commitDeadline?: bigint;
  revealDeadline?: bigint;
  creatorConflict: boolean;
  contributorConflict: boolean;
  enrolled: boolean;
  assigned: boolean;
  evidenceReady: boolean;
  secretValid: boolean;
  hasOnchainCommitment: boolean;
  commitmentMatches: boolean;
  revealed: boolean;
  courtFinalized: boolean;
  judgeSettled: boolean;
  pendingReward: bigint;
  rewardClaimed: boolean;
  claimSimulationReady: boolean;
  transactionAction?: string;
  transactionStage: VNextTransactionStage;
  transactionHash?: string;
  receiptStatus?: 'success' | 'reverted';
}

export interface VNextJudgeActionAvailability {
  ready: boolean;
  reason?: string;
}

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const transactionPendingStages = new Set<VNextTransactionStage>([
  'wallet_requested',
  'submitted',
  'receipt_confirmed',
  'indexing',
]);

export function isVNextBytes32(value: string): value is `0x${string}` {
  return bytes32Pattern.test(value);
}

export function vnextJudgeVoteNumber(vote: VNextJudgeVote): 1 | 2 {
  return vote === 'PASS' ? 1 : 2;
}

export function makeVNextVoteCommitment(input: VNextVoteCommitmentInput): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint8' },
      { type: 'bytes32' },
    ],
    [
      input.chainId,
      input.protocolVersion,
      input.campaignId,
      input.milestoneId,
      input.evidenceRevision,
      input.reviewCaseNumber,
      input.roundId,
      input.courtId,
      input.judgeAddress,
      vnextJudgeVoteNumber(input.vote),
      input.salt,
    ],
  ));
}

export function generateVNextJudgeSalt(
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => unknown = bytes => crypto.getRandomValues(bytes),
): `0x${string}` {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function serializeVNextJudgeSecretBackup(
  context: VNextJudgeSecretContext,
  secret: VNextJudgeSecret,
): string {
  if (!isVNextBytes32(context.reviewCaseId) || !isAddress(context.judgeAddress) || !isVNextBytes32(secret.salt)) {
    throw new Error('Judge secret backup không hợp lệ.');
  }
  return JSON.stringify({
    version: 1,
    chainId: context.chainId,
    reviewCaseId: context.reviewCaseId.toLowerCase(),
    courtId: context.courtId.toString(),
    judgeAddress: context.judgeAddress.toLowerCase(),
    vote: secret.vote,
    salt: secret.salt,
  }, null, 2);
}

export function parseVNextJudgeSecretBackup(
  value: string,
  context: VNextJudgeSecretContext,
): VNextJudgeSecret {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error('Backup phải là JSON do Judge workspace xuất ra.');
  }
  if (
    parsed.version !== 1
    || parsed.chainId !== context.chainId
    || String(parsed.reviewCaseId).toLowerCase() !== context.reviewCaseId.toLowerCase()
    || String(parsed.courtId) !== context.courtId.toString()
    || String(parsed.judgeAddress).toLowerCase() !== context.judgeAddress.toLowerCase()
  ) {
    throw new Error('Backup không thuộc đúng case, court và ví Judge hiện tại.');
  }
  if ((parsed.vote !== 'PASS' && parsed.vote !== 'FAIL') || typeof parsed.salt !== 'string' || !isVNextBytes32(parsed.salt)) {
    throw new Error('Backup không chứa vote và salt bytes32 hợp lệ.');
  }
  return { vote: parsed.vote, salt: parsed.salt };
}

function transactionBlocks(input: VNextJudgeCaseStateInput, action: string): boolean {
  if (input.transactionAction !== action || input.receiptStatus === 'reverted') return false;
  return transactionPendingStages.has(input.transactionStage)
    || Boolean(input.transactionHash && input.receiptStatus !== 'success');
}

function transactionBlockReason(input: VNextJudgeCaseStateInput, action: string): string | undefined {
  if (!transactionBlocks(input, action)) return undefined;
  return input.transactionHash && input.receiptStatus !== 'success'
    ? 'Transaction đã submit nhưng receipt chưa xác định; đối soát trước khi thử lại.'
    : 'Transaction trước đang xử lý; không gửi giao dịch trùng.';
}

function commitAvailability(input: VNextJudgeCaseStateInput): VNextJudgeActionAvailability {
  if (!input.rpcAvailable || input.chainTimestamp === undefined || input.roundStatus === undefined) {
    return { ready: false, reason: 'RPC chưa cung cấp trạng thái canonical của case.' };
  }
  if (!input.assigned) return { ready: false, reason: 'Ví hiện tại không phải Judge được contract assign.' };
  if (!input.evidenceReady) return { ready: false, reason: 'Evidence policy chưa ở trạng thái READY.' };
  if (input.roundStatus !== 3) return { ready: false, reason: 'Case chưa ở phase COMMIT on-chain.' };
  if (input.enrollmentDeadline === undefined || input.commitDeadline === undefined) {
    return { ready: false, reason: 'Commit deadline chưa đọc được từ contract.' };
  }
  if (input.chainTimestamp < input.enrollmentDeadline) return { ready: false, reason: 'Commit window chưa mở.' };
  if (input.chainTimestamp >= input.commitDeadline) return { ready: false, reason: 'Commit deadline đã hết hạn.' };
  if (input.hasOnchainCommitment) return { ready: false, reason: 'Judge đã có commitment canonical.' };
  if (!input.secretValid) return { ready: false, reason: 'Hãy chọn PASS/FAIL và generate hoặc import secret hợp lệ.' };
  const transactionReason = transactionBlockReason(input, 'commitVote');
  if (transactionReason) return { ready: false, reason: transactionReason };
  return { ready: true };
}

function revealAvailability(input: VNextJudgeCaseStateInput): VNextJudgeActionAvailability {
  if (!input.rpcAvailable || input.chainTimestamp === undefined || input.roundStatus === undefined) {
    return { ready: false, reason: 'RPC chưa cung cấp trạng thái canonical của case.' };
  }
  if (!input.assigned) return { ready: false, reason: 'Ví hiện tại không phải Judge được contract assign.' };
  if (!input.hasOnchainCommitment) return { ready: false, reason: 'Không có on-chain commitment để Reveal.' };
  if (input.revealed) return { ready: false, reason: 'Vote đã Reveal on-chain.' };
  if (!input.secretValid) return { ready: false, reason: 'Thiếu vote/salt backup đã dùng khi Commit.' };
  if (!input.commitmentMatches) return { ready: false, reason: 'Vote/salt không khớp on-chain commitment.' };
  if (input.roundStatus !== 3) return { ready: false, reason: 'Case không còn ở voting phase.' };
  if (input.commitDeadline === undefined || input.revealDeadline === undefined) {
    return { ready: false, reason: 'Reveal deadline chưa đọc được từ contract.' };
  }
  if (input.chainTimestamp < input.commitDeadline) return { ready: false, reason: 'Reveal window chưa mở.' };
  if (input.chainTimestamp >= input.revealDeadline) return { ready: false, reason: 'Reveal deadline đã hết hạn.' };
  const transactionReason = transactionBlockReason(input, 'revealVote');
  if (transactionReason) return { ready: false, reason: transactionReason };
  return { ready: true };
}

function claimAvailability(input: VNextJudgeCaseStateInput): VNextJudgeActionAvailability {
  if (!input.rpcAvailable) return { ready: false, reason: 'RPC chưa cung cấp reward canonical.' };
  if (!input.assigned) return { ready: false, reason: 'Ví hiện tại không phải Judge của case.' };
  if (input.rewardClaimed) return { ready: false, reason: 'Reward đã claim on-chain.' };
  if (!input.judgeSettled) return { ready: false, reason: 'Judge settlement chưa hoàn tất.' };
  if (input.pendingReward === 0n) return { ready: false, reason: 'Judge chưa có reward được accrue.' };
  if (!input.claimSimulationReady) return { ready: false, reason: 'Contract simulation chưa cho phép Claim Reward.' };
  const transactionReason = transactionBlockReason(input, 'claimReward');
  if (transactionReason) return { ready: false, reason: transactionReason };
  return { ready: true };
}

function phaseLabel(input: VNextJudgeCaseStateInput): string {
  if (input.roundStatus === undefined || input.chainTimestamp === undefined) return 'RPC UNAVAILABLE';
  if (input.roundStatus === 0) return 'ENROLLMENT';
  if (input.roundStatus === 1 || input.roundStatus === 2) return 'ASSIGNMENT';
  if (input.roundStatus === 3) {
    if (input.commitDeadline !== undefined && input.chainTimestamp < input.commitDeadline) return 'COMMIT';
    if (input.revealDeadline !== undefined && input.chainTimestamp < input.revealDeadline) return 'REVEAL';
    return 'COURT FINALIZATION';
  }
  if (input.roundStatus === 4 || input.roundStatus === 5 || input.roundStatus === 7) return 'COURT FINALIZED';
  if (input.roundStatus === 11) return 'SETTLEMENT COMPLETE';
  return 'SETTLEMENT';
}

function participationStatus(input: VNextJudgeCaseStateInput): string {
  if (input.rewardClaimed) return 'REWARD_CLAIMED';
  if (input.pendingReward > 0n) return 'REWARD_CLAIMABLE';
  if (input.judgeSettled) return 'SETTLEMENT_COMPLETE';
  if (input.courtFinalized) return 'COURT_FINALIZED';
  if (input.revealed) return 'REVEALED';
  if (input.hasOnchainCommitment) return 'AWAITING_REVEAL';
  if (input.assigned) return 'ASSIGNED';
  if (input.enrolled) return 'ENROLLED_NOT_SELECTED';
  if (
    input.roundStatus === 0
    && input.chainTimestamp !== undefined
    && input.enrollmentDeadline !== undefined
    && input.chainTimestamp < input.enrollmentDeadline
    && !input.creatorConflict
    && !input.contributorConflict
  ) return 'ELIGIBLE_NOT_ENROLLED';
  return 'NOT_ELIGIBLE';
}

export function vnextJudgeCaseState(input: VNextJudgeCaseStateInput) {
  const commit = commitAvailability(input);
  const reveal = revealAvailability(input);
  const claim = claimAvailability(input);
  const enrollmentReady = input.roundStatus === 0
    && input.chainTimestamp !== undefined
    && input.enrollmentDeadline !== undefined
    && input.chainTimestamp < input.enrollmentDeadline
    && !input.enrolled
    && !input.creatorConflict
    && !input.contributorConflict;
  const nextAction = claim.ready
    ? 'CLAIM REWARD'
    : reveal.ready
      ? 'REVEAL VOTE'
      : commit.ready
        ? 'COMMIT VOTE'
        : enrollmentReady
          ? 'RESERVE STAKE AND ENROLL'
          : input.courtFinalized
            ? 'WAIT FOR SETTLEMENT'
            : 'WAIT FOR NEXT PHASE';
  return {
    phaseLabel: phaseLabel(input),
    participationStatus: participationStatus(input),
    nextAction,
    priority: commit.ready || reveal.ready || claim.ready ? 0 : enrollmentReady ? 1 : input.assigned ? 2 : 3,
    commit,
    reveal,
    claim,
  };
}

export function formatVNextChainDeadline(seconds: bigint | undefined): string {
  if (seconds === undefined || seconds === 0n) return 'Chưa thiết lập';
  return new Date(Number(seconds) * 1_000).toLocaleString();
}
