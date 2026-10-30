import { formatUnits, parseUnits } from 'viem';
import type { VNextTransactionEvent } from '../api/campaigns';
import type { VNextTransactionStage } from './vnext-actions';

export function parseVNextContributionAmount(input: string, decimals: number) {
  const value = input.trim();
  if (!value) return { error: 'Nhập số tiền muốn đóng góp.' };
  if (value.startsWith('-')) return { error: 'Số tiền đóng góp không được âm.' };
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return { error: 'Số tiền không đúng định dạng thập phân.' };
  }

  const fraction = value.split('.')[1] ?? '';
  if (fraction.length > decimals) {
    return { error: `MockUSDC chỉ hỗ trợ tối đa ${decimals} chữ số thập phân.` };
  }

  const amount = parseUnits(value, decimals);
  if (amount === 0n) return { error: 'Số tiền đóng góp phải lớn hơn 0.' };
  return { amount };
}

export function displayVNextFundingAmount(
  value: bigint | string | undefined,
  decimals: number | undefined,
) {
  if (value === undefined || decimals === undefined) return 'Không khả dụng';
  try {
    return `${formatUnits(typeof value === 'bigint' ? value : BigInt(value), decimals)} MockUSDC`;
  } catch {
    return 'Không khả dụng';
  }
}

export function vnextFundingProgress(raised: bigint, goal: bigint) {
  const remaining = raised >= goal ? 0n : goal - raised;
  const percentageHundredths = goal === 0n ? 0n : (raised * 10_000n) / goal;
  const whole = percentageHundredths / 100n;
  const fraction = (percentageHundredths % 100n).toString().padStart(2, '0');
  return {
    remaining,
    percentageHundredths,
    percentageLabel: `${whole}.${fraction}%`,
  };
}

export interface VNextContributionEligibilityInput {
  amount: bigint;
  walletConnected: boolean;
  correctChain: boolean;
  fundingState: number | undefined;
  chainTimestamp: bigint | undefined;
  fundingDeadline: bigint;
  walletBalance: bigint | undefined;
  remaining: bigint;
  rpcReady: boolean;
  transactionPending: boolean;
}

export function vnextContributionEligibility(input: VNextContributionEligibilityInput) {
  if (!input.walletConnected) return { ready: false, reason: 'Kết nối ví Backer để đóng góp.' };
  if (!input.correctChain) return { ready: false, reason: 'Chuyển ví sang chain 31339.' };
  if (!input.rpcReady || input.fundingState === undefined || input.chainTimestamp === undefined || input.walletBalance === undefined) {
    return { ready: false, reason: 'Đang đọc trạng thái funding trực tiếp từ contract.' };
  }
  if (input.transactionPending) {
    return { ready: false, reason: 'Contribution trước đang xử lý; không gửi transaction trùng.' };
  }
  if (input.fundingState !== 1) {
    return { ready: false, reason: 'Campaign không còn ở trạng thái FUNDING on-chain.' };
  }
  if (input.chainTimestamp >= input.fundingDeadline) {
    return { ready: false, reason: 'Funding đã đóng theo thời gian on-chain.' };
  }
  if (input.amount > input.remaining) {
    return { ready: false, reason: 'Số tiền vượt phần funding còn thiếu của Campaign.' };
  }
  if (input.amount > input.walletBalance) {
    return { ready: false, reason: 'Số dư MockUSDC của ví không đủ.' };
  }
  return { ready: true, reason: undefined };
}

export function vnextContributionApprovalRequired(allowance: bigint, amount: bigint) {
  return allowance < amount;
}

export function vnextFundingSimulationReason(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  const reasons: Array<[RegExp, string]> = [
    [/ContributionExceedsGoal/i, 'Số tiền vượt phần funding còn thiếu của Campaign.'],
    [/FundingClosed/i, 'Funding đã đóng theo thời gian on-chain.'],
    [/WrongState/i, 'Campaign không còn ở trạng thái FUNDING on-chain.'],
    [/InvalidAmount/i, 'Số tiền đóng góp không hợp lệ.'],
    [/insufficient allowance|ERC20InsufficientAllowance/i, 'Allowance MockUSDC không đủ; approve đúng số tiền trước.'],
    [/insufficient balance|ERC20InsufficientBalance/i, 'Số dư MockUSDC của ví không đủ.'],
  ];
  return reasons.find(([pattern]) => pattern.test(message))?.[1]
    ?? 'Contract simulation chưa cho phép contribution; refresh trạng thái trước khi thử lại.';
}

export interface VNextCanonicalContribution {
  campaignId: string;
  contributor: string;
  amount: bigint;
}

export interface VNextCanonicalEventExpectation {
  eventName: string;
  args: Record<string, string>;
}

export function vnextCanonicalEventIndexed(
  events: VNextTransactionEvent[],
  expected: VNextCanonicalEventExpectation,
) {
  return events.some(event => event.eventName === expected.eventName
    && Object.entries(expected.args).every(([key, value]) => (
      String(event.args[key]).toLowerCase() === value.toLowerCase()
    )));
}

export function vnextCanonicalContributionIndexed(
  events: VNextTransactionEvent[],
  expected: VNextCanonicalContribution,
) {
  return vnextCanonicalEventIndexed(events, {
    eventName: 'ContributionReceived',
    args: {
      campaignId: expected.campaignId,
      backer: expected.contributor,
      amount: expected.amount.toString(),
    },
  });
}

export function vnextContributionLifecycle(stage: VNextTransactionStage) {
  const labels = {
    idle: 'READY',
    wallet_requested: 'WAITING_FOR_WALLET',
    submitted: 'SUBMITTED',
    receipt_confirmed: 'RECEIPT_CONFIRMED',
    indexing: 'INDEXING',
    indexed: 'CONTRIBUTION_CONFIRMED',
    failed: 'FAILED',
  } as const;
  return labels[stage];
}
