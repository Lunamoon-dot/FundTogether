import type { AccountSession } from '../../../lib/api/auth';
import type { CampaignChain, Entitlement } from '../api/campaigns';
import { PledgePreflight } from '../shared/ui/PledgePreflight';
import type { useTransaction } from '../transactions/useTransaction';

export type CampaignTransactionController = ReturnType<typeof useTransaction>;

export interface BackerCampaignActionsProps {
  campaignId: string;
  session: AccountSession | null;
  chain: CampaignChain;
  entitlement?: Entitlement;
  transaction: CampaignTransactionController;
  onRefresh: () => void;
}

const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString('vi-VN');

export function BackerCampaignActions({ campaignId, session, chain, entitlement, transaction, onRefresh }: BackerCampaignActionsProps) {
  const state = chain.snapshot;
  const activeId = chain.onchainCampaignId == null ? null : BigInt(chain.onchainCampaignId);
  const chainNow = chain.chainTimestamp ? BigInt(chain.chainTimestamp) : null;
  const fundingExpired = Boolean(state && chainNow !== null && chainNow >= BigInt(state.fundingDeadline));
  const busy = transaction.busy;

  if (!state || activeId === null) return null;

  if (state.state === 4) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-[#b45309]">
          {entitlement?.access === 'REFUNDED' ? 'Bạn đã nhận hoàn tiền' : entitlement?.access === 'REFUND_ELIGIBLE' ? 'Khoản pledge của bạn đã đủ điều kiện hoàn tiền' : 'Backer tự nhận hoàn tiền'}
        </div>
        <p className="text-xs text-[var(--ink-lead)] m-0">
          {entitlement?.access === 'REFUNDED' ? 'Giao dịch hoàn tiền đã được ghi nhận. Bạn không cần thực hiện thêm bước nào.' : entitlement?.access === 'REFUND_ELIGIBLE' ? 'Tiền sẽ trở về đúng ví đã dùng để pledge.' : 'Resolver đã mở trạng thái hoàn tiền. Mỗi backer tự claim khoản của mình; Creator không nhận khoản này.'}
        </p>
        {session?.userId && entitlement?.access === 'REFUND_ELIGIBLE' && (
          <button disabled={busy} className="button button--primary w-full" onClick={() => void transaction.send('claimRefund', [activeId], { expectedWallet: entitlement.backerWallet }).finally(onRefresh)}>
            Nhận hoàn tiền vào ví đã pledge
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {fundingExpired && <p role="status" className="text-xs text-[#b45309] m-0">Đã hết hạn gây quỹ · chờ Resolver chốt kết quả. Pledge đã bị khóa cho đến khi contract được chốt.</p>}
      {state.state === 3 && <p className="text-xs text-[var(--ink-subtle)] m-0">Challenge đến {date(state.challengeDeadline)} · {state.openDisputes} tranh chấp mở.</p>}
      {state.state === 0 && state.price && !fundingExpired && (
        <PledgePreflight
          campaignId={campaignId}
          userId={session?.userId}
          activeId={activeId}
          price={state.price}
          chain={chain}
          deployment={chain.deployment}
          transaction={transaction.transaction?.action === 'pledge' ? transaction.transaction : null}
          busy={busy}
          onPledge={quantity => void transaction.send('pledge', [activeId, quantity], { pledgePrice: (BigInt(state.price) * quantity).toString() }).finally(onRefresh)}
          onReconcile={() => void transaction.reconcile()}
        />
      )}
    </>
  );
}
