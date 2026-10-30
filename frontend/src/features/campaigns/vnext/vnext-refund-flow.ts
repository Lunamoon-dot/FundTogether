import { formatUnits } from 'viem';
import type { VNextTransactionStage } from './vnext-actions';

export function displayVNextTokenAmount(value: bigint | string | undefined, decimals: number | undefined) {
  if (value === undefined || decimals === undefined) return 'Không khả dụng';
  try {
    return `${formatUnits(typeof value === 'bigint' ? value : BigInt(value), decimals)} MockUSDC`;
  } catch {
    return 'Không khả dụng';
  }
}

export interface VNextRefundDashboardInput {
  campaignState: number;
  walletConnected: boolean;
  correctChain: boolean;
  rpcAvailable: boolean;
  allocationsFrozen: boolean;
  contribution: bigint;
  refundClaimed: boolean;
  indexedRefundClaimed: boolean;
  indexedRefunded?: bigint;
  simulationReady: boolean;
  simulationPending?: boolean;
  simulationError?: string;
  transactionAction?: string;
  transactionBusy?: boolean;
  transactionStage: VNextTransactionStage;
}

export function vnextRefundDashboardState(input: VNextRefundDashboardInput) {
  const allocation = {
    ready: input.campaignState === 5
      && input.walletConnected
      && input.correctChain
      && input.rpcAvailable
      && !input.allocationsFrozen
      && !input.transactionBusy,
    reason: undefined as string | undefined,
  };

  if (input.campaignState === 6) {
    return {
      allocation: { ready: false, reason: 'REFUNDING_REMAINDER chưa được contract hiện tại hỗ trợ.' },
      claim: { ready: false, reason: 'REFUNDING_REMAINDER không hỗ trợ freeze hoặc claim refund trong contract hiện tại.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (input.campaignState !== 5) {
    return {
      allocation: { ready: false, reason: 'Campaign chưa ở trạng thái REFUNDING.' },
      claim: { ready: false, reason: 'Campaign không ở trạng thái có thể claim refund.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (!input.walletConnected) {
    return {
      allocation: { ready: false, reason: 'Kết nối ví để chuẩn bị phân bổ refund.' },
      claim: { ready: false, reason: 'Kết nối ví Backer để claim refund.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (!input.correctChain) {
    return {
      allocation: { ready: false, reason: 'Chuyển ví sang chain 31339.' },
      claim: { ready: false, reason: 'Ví đang kết nối sai chain.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (!input.rpcAvailable) {
    return {
      allocation: { ready: false, reason: 'RPC VNext hiện không khả dụng.' },
      claim: { ready: false, reason: 'Không thể đọc hoặc mô phỏng claim qua RPC.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (input.transactionAction === 'claimRefund') {
    if (input.transactionStage === 'submitted') {
      return {
        allocation: { ready: false, reason: 'Refund transaction đang xử lý.' },
        claim: { ready: false, reason: 'Refund transaction đã được submit.' },
        status: 'SUBMITTED' as const,
      };
    }
    if (input.transactionStage === 'receipt_confirmed') {
      return {
        allocation: { ready: false, reason: 'Refund transaction đang xử lý.' },
        claim: { ready: false, reason: 'Receipt đã được xác nhận.' },
        status: 'RECEIPT_CONFIRMED' as const,
      };
    }
    if (input.transactionStage === 'indexing' || input.transactionStage === 'indexed') {
      return {
        allocation: { ready: false, reason: 'Refund transaction đang chờ canonical indexer.' },
        claim: { ready: false, reason: 'Không gửi lại claim khi indexer đang đồng bộ.' },
        status: input.indexedRefundClaimed ? 'REFUNDED' as const : 'INDEXING' as const,
        refundedAmount: input.indexedRefundClaimed ? input.indexedRefunded ?? 0n : undefined,
      };
    }
    if (input.transactionStage === 'failed') {
      return {
        allocation,
        claim: { ready: false, reason: 'Refund transaction thất bại.' },
        status: 'FAILED' as const,
      };
    }
  }

  if (!input.allocationsFrozen) {
    return {
      allocation,
      claim: { ready: false, reason: 'Phân bổ refund chưa hoàn tất.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (input.contribution === 0n) {
    return {
      allocation: { ready: false, reason: 'Phân bổ refund đã được khóa.' },
      claim: { ready: false, reason: 'Ví hiện tại chưa đóng góp cho campaign.' },
      status: 'UNAVAILABLE' as const,
    };
  }

  if (input.refundClaimed) {
    return {
      allocation: { ready: false, reason: 'Phân bổ refund đã được khóa.' },
      claim: { ready: false, reason: 'Ví hiện tại đã claim refund.' },
      status: input.indexedRefundClaimed ? 'REFUNDED' as const : 'INDEXING' as const,
      refundedAmount: input.indexedRefundClaimed ? input.indexedRefunded ?? 0n : undefined,
    };
  }

  if (input.simulationReady) {
    return {
      allocation: { ready: false, reason: 'Phân bổ refund đã được khóa.' },
      claim: { ready: true, reason: undefined },
      status: 'READY_TO_CLAIM' as const,
    };
  }

  return {
    allocation: { ready: false, reason: 'Phân bổ refund đã được khóa.' },
    claim: {
      ready: false,
      reason: input.simulationPending
        ? 'Đang mô phỏng claim với contract.'
        : input.simulationError ?? 'Contract simulation chưa xác nhận quyền claim.',
    },
    status: 'UNAVAILABLE' as const,
  };
}
