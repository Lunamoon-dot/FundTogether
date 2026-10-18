import type { CampaignChain, CampaignTerms, Entitlement } from '../api/campaigns';
import { ActivationPanel } from '../shared/ui/ActivationPanel';
import { CompletionSettlementPanel } from '../shared/ui/CompletionSettlementPanel';
import { DisbursementPanel } from '../shared/ui/DisbursementPanel';
import type { useTransaction } from '../transactions/useTransaction';

type CreatorTransactionController = ReturnType<typeof useTransaction>;

export interface CreatorCampaignActionsProps {
  campaignId: string;
  userId: string;
  chain: CampaignChain;
  terms?: CampaignTerms;
  transaction: CreatorTransactionController;
  busy: boolean;
  entitlement?: Entitlement;
  onRefresh: () => void;
  onActivate: () => void;
  onReconcile: () => void;
}

export function CreatorCampaignActions({ campaignId, userId, chain, terms, transaction, busy, entitlement, onRefresh, onActivate, onReconcile }: CreatorCampaignActionsProps) {
  return (
    <>
      <ActivationPanel
        mode="creator"
        terms={terms}
        chain={chain}
        transaction={transaction.transaction?.action === 'createCampaign' ? transaction.transaction : null}
        busy={busy}
        onRefresh={onRefresh}
        onActivate={onActivate}
        onReconcile={onReconcile}
      />
      <DisbursementPanel campaignId={campaignId} userId={userId} mode="creator" chain={chain} transaction={transaction} onRefresh={onRefresh} />
      <CompletionSettlementPanel campaignId={campaignId} userId={userId} mode="creator" chain={chain} transaction={transaction} entitlement={entitlement} onRefresh={onRefresh} />
    </>
  );
}

export function CreatorLedgerActions({ chain, transaction }: { chain: CampaignChain; transaction: CreatorTransactionController }) {
  const state = chain.snapshot;
  const activeId = chain.onchainCampaignId == null ? null : BigInt(chain.onchainCampaignId);
  if (!state || activeId === null || [4, 5, 6].includes(state.state)) return null;

  return (
    <button disabled={transaction.busy} className="button button--secondary w-full" onClick={() => void transaction.send('cancelCampaign', [activeId], { expectedWallet: state.creator })}>
      Hủy campaign và mở hoàn tiền toàn bộ
    </button>
  );
}
