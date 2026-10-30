import type { VNextTransactionStage } from './vnext-actions';

export const courtVerdicts = ['PENDING', 'PASS', 'FAIL', 'TIED', 'INVALID'] as const;
export const roundVerdicts = ['PENDING', 'PASS', 'FAIL', 'TIED', 'INVALID'] as const;
export const finalOutcomes = ['PENDING', 'FINAL_PASS', 'VERDICT_FAIL', 'PROTOCOL_FAIL'] as const;

export type VNextPaymentStatus =
  | 'NOT_ELIGIBLE'
  | 'SETTLEMENT_PENDING'
  | 'SYNC_PENDING'
  | 'CHALLENGE_WINDOW_OPEN'
  | 'PAYOUT_ELIGIBLE'
  | 'TRANSACTION_PENDING'
  | 'PAID_INDEXED'
  | 'CORRECTION'
  | 'RECOVERY_REFUND';

export type VNextRetryStatus = 'NONE' | 'RETRY_ELIGIBLE' | 'RETRY_EXHAUSTED';

export interface VNextPaymentStatusInput {
  paid: boolean;
  finalOutcome: number;
  settlementComplete: boolean;
  synchronized: boolean;
  chainTimestamp?: bigint;
  challengeDeadline?: bigint;
  payoutPreflightReady: boolean;
  transactionStage: VNextTransactionStage;
}

export function courtVerdictLabel(value?: number | null): string {
  return courtVerdicts[value ?? 0] ?? 'INVALID';
}

export function roundVerdictLabel(value?: number | null): string {
  return roundVerdicts[value ?? 0] ?? 'INVALID';
}

export function finalOutcomeLabel(value?: number | null): string {
  return finalOutcomes[value ?? 0] ?? 'PROTOCOL_FAIL';
}

export function vnextPaymentStatus(input: VNextPaymentStatusInput): VNextPaymentStatus {
  if (input.paid) return 'PAID_INDEXED';
  if (
    input.transactionStage === 'submitted'
    || input.transactionStage === 'receipt_confirmed'
    || input.transactionStage === 'indexed'
  ) {
    return 'TRANSACTION_PENDING';
  }
  if (input.finalOutcome === 2) return 'CORRECTION';
  if (input.finalOutcome === 3) return 'RECOVERY_REFUND';
  if (input.finalOutcome !== 1) return 'NOT_ELIGIBLE';
  if (!input.settlementComplete) return 'SETTLEMENT_PENDING';
  if (!input.synchronized) return 'SYNC_PENDING';
  if (input.payoutPreflightReady) return 'PAYOUT_ELIGIBLE';
  if (
    input.chainTimestamp !== undefined
    && input.challengeDeadline !== undefined
    && input.chainTimestamp < input.challengeDeadline
  ) {
    return 'CHALLENGE_WINDOW_OPEN';
  }
  return 'NOT_ELIGIBLE';
}

export function vnextRetryStatus(
  roundOutcome: number | null | undefined,
  retryCount: bigint,
  maximumRetries: bigint,
): VNextRetryStatus {
  if (roundOutcome !== 3 && roundOutcome !== 4) return 'NONE';
  return retryCount < maximumRetries ? 'RETRY_ELIGIBLE' : 'RETRY_EXHAUSTED';
}

export function vnextBlockedReason(cause: unknown): string {
  const message = cause instanceof Error ? errorChain(cause) : String(cause);
  const reasons: Array<[RegExp, string]> = [
    [/AppealWindowOpen/i, 'Cửa sổ appeal chưa kết thúc.'],
    [/ReviewSettlementPending/i, 'Judge settlement chưa hoàn tất.'],
    [/ChallengeWindowOpen/i, 'Challenge window chưa kết thúc.'],
    [/MilestoneAlreadyPaid/i, 'Milestone đã được payout on-chain; đang chờ indexer cập nhật.'],
    [/PayoutUnavailable/i, 'Milestone chưa thỏa toàn bộ điều kiện payout on-chain.'],
    [/RetryNotReady/i, 'Review hiện tại chưa đủ điều kiện retry.'],
    [/RetriesExhausted/i, 'Retry budget đã hết.'],
    [/ProtocolFailureNotReady/i, 'Chưa đủ điều kiện terminalize protocol failure.'],
    [/SettlementNotPrepared/i, 'Final ruling chưa sẵn sàng cho settlement.'],
    [/FinalRulingAlreadyEstablished/i, 'Final ruling đã được thiết lập.'],
    [/FinalRulingAlreadySynced/i, 'Milestone outcome đã được đồng bộ.'],
    [/ReviewNotFinal/i, 'Review mới là provisional hoặc chưa có final ruling.'],
    [/WrongState/i, 'Trạng thái on-chain hiện tại không cho phép thao tác này.'],
  ];
  return reasons.find(([pattern]) => pattern.test(message))?.[1]
    ?? 'Precondition on-chain chưa thỏa; refresh trạng thái trước khi thử lại.';
}

function errorChain(error: Error): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' ');
}
