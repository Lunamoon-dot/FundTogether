import { useState } from 'react';
import { keccak256, toHex } from 'viem';
import type { CampaignChain, CampaignTerms, Evidence } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { ActivationPanel } from '../shared/ui/ActivationPanel';
import { CompletionSettlementPanel } from '../shared/ui/CompletionSettlementPanel';
import { DisbursementPanel } from '../shared/ui/DisbursementPanel';
import { CAMPAIGN_CHAIN_STATE } from '../shared/ui/campaignState';
import type { useTransaction } from '../transactions/useTransaction';

type ResolverTransactionController = ReturnType<typeof useTransaction>;
type ResolverSection = 'overview' | 'production' | 'activity';

export interface ResolverCampaignActionsProps {
  campaignId: string;
  userId: string;
  chain: CampaignChain;
  terms?: CampaignTerms;
  evidence: Evidence[];
  transaction: ResolverTransactionController;
  busy: boolean;
  section: ResolverSection;
  onRefresh: () => void;
  onActivate: () => void;
  onReconcile: () => void;
}

function resolverWalletMatches(chain: CampaignChain, address?: string) {
  if (!address) return false;
  return [chain.deployment.resolver, chain.deployment.backupResolver]
    .some(wallet => wallet.toLowerCase() === address.toLowerCase());
}

export function ResolverCampaignActions({
  campaignId,
  userId,
  chain,
  terms,
  evidence,
  transaction,
  busy,
  section,
  onRefresh,
  onActivate,
  onReconcile,
}: ResolverCampaignActionsProps) {
  const [reason, setReason] = useState('');
  const state = chain.snapshot;
  const activeId = chain.onchainCampaignId == null ? null : BigInt(chain.onchainCampaignId);
  const connectedResolver = resolverWalletMatches(chain, transaction.address);
  const chainNow = chain.chainTimestamp ? BigInt(chain.chainTimestamp) : null;
  const fundingExpired = Boolean(state && chainNow !== null && chainNow >= BigInt(state.fundingDeadline));
  const productionPolicyExpired = Boolean(state && chainNow !== null && state.state === CAMPAIGN_CHAIN_STATE.ACTIVE
    && (!state.productionApproved || BigInt(state.releaseDeadline) === 0n)
    && chainNow >= BigInt(state.fundingDeadline) + 30n * 24n * 60n * 60n);
  const releasePolicyExpired = Boolean(state && chainNow !== null && BigInt(state.releaseDeadline) > 0n
    && state.state !== CAMPAIGN_CHAIN_STATE.RELEASED
    && chainNow >= BigInt(state.releaseDeadline) + 7n * 24n * 60n * 60n);
  const disputeTimedOut = Boolean(state && chainNow !== null && state.state === CAMPAIGN_CHAIN_STATE.RELEASED
    && BigInt(state.openDisputes) > 0n && chainNow >= BigInt(state.disputeDeadline));
  const canFinalizeFunding = Boolean(state && activeId !== null && state.state === CAMPAIGN_CHAIN_STATE.FUNDING && fundingExpired);
  const canStartRefunds = Boolean(state && activeId !== null && state.state !== CAMPAIGN_CHAIN_STATE.FUNDING
    && state.state !== CAMPAIGN_CHAIN_STATE.REFUNDING
    && state.state !== CAMPAIGN_CHAIN_STATE.COMPLETION_REQUESTED
    && state.state !== CAMPAIGN_CHAIN_STATE.COMPLETED
    && (productionPolicyExpired || releasePolicyExpired || disputeTimedOut));
  const reviewableEvidence = state?.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW
    ? evidence.find(item => item.evidenceHash === state.releaseEvidenceHash)
    : evidence.find(item => item.evidenceHash === state?.productionHash);
  const pendingProduction = Boolean(state && state.state === CAMPAIGN_CHAIN_STATE.ACTIVE
    && state.productionHash !== `0x${'0'.repeat(64)}` && !state.productionApproved);
  const waitingForFinalPdf = Boolean(state && state.state === CAMPAIGN_CHAIN_STATE.ACTIVE
    && state.productionApproved && BigInt(state.releaseDeadline) > 0n
    && state.pdfHash === `0x${'0'.repeat(64)}`);

  async function resolveChallenge(challengeBacker: string, upheld: boolean) {
    if (activeId === null || reason.trim().length < 10) return;
    const body = `${upheld ? 'UPHELD' : 'DISMISSED'}: ${reason.trim()}`;
    try {
      await campaignApi.comment(campaignId, { targetHash: state?.releaseEvidenceHash ?? '', kind: 'COMMENT', body });
      await transaction.send('resolveChallenge', [activeId, challengeBacker, upheld, keccak256(toHex(body))]);
      onRefresh();
    } catch {
      // useTransaction exposes the canonical transaction error in the workspace alert
    }
  }

  if (!state || activeId === null || chain.status !== 'ON_CHAIN_CONFIRMED') {
    if (section === 'overview' && (chain.status === 'NOT_PUBLISHED' || chain.status === 'ORPHANED')) {
      if (!connectedResolver) {
        return <div className="monograph-alert monograph-alert--warning" role="alert">
          Ví hiện tại không phải Primary hoặc Backup Resolver. Các nút ký đã khóa; hãy chuyển đúng ví rồi kiểm tra lại.
        </div>;
      }
      return <ActivationPanel
        mode="resolver"
        terms={terms}
        chain={chain}
        transaction={transaction.transaction?.action === 'approveCampaign' ? transaction.transaction : null}
        busy={busy}
        onRefresh={onRefresh}
        onActivate={onActivate}
        onReconcile={onReconcile}
      />;
    }
    return <p className="text-sm text-[var(--ink-subtle)]">Chưa có trạng thái campaign canonical để mở hành động Resolver.</p>;
  }

  if (!connectedResolver) {
    return <div className="monograph-alert monograph-alert--warning" role="alert">
      Ví hiện tại không phải Primary hoặc Backup Resolver. Các nút ký đã khóa; hãy chuyển đúng ví rồi kiểm tra lại.
    </div>;
  }

  if (section === 'production') {
    return <section className="monograph-card space-y-4" aria-labelledby="resolver-production-actions-title">
      <span className="monograph-card__kicker">RESOLVER REVIEW · PRODUCTION</span>
      <h2 id="resolver-production-actions-title" className="monograph-card__title">Duyệt bằng chứng sản xuất</h2>
      <p className="monograph-card__desc">Resolver kiểm tra file riêng tư và hash canonical trước khi duyệt hoặc từ chối bước sản xuất/PDF cuối.</p>
      {waitingForFinalPdf && <div className="monograph-alert monograph-alert--info" role="status"><strong>Đang chờ Creator gửi PDF cuối.</strong> Creator đã chốt hạn phát hành PDF nhưng chưa gửi PDF/hash release, nên hiện chưa có quyết định nào cần Resolver ký.</div>}
      {state.state === CAMPAIGN_CHAIN_STATE.RELEASED && <p className="monograph-alert monograph-alert--info">PDF đã được duyệt. Hãy theo dõi challenge trước khi xử lý hồ sơ hoàn thành.</p>}
      {reviewableEvidence && <article className="border border-[var(--border-hairline)] rounded p-3 space-y-2">
        <strong>{reviewableEvidence.purpose === 'FINAL_PDF' ? 'PDF cuối đang chờ duyệt' : 'Bằng chứng sản xuất đang chờ duyệt'}</strong>
        <p className="text-sm">{reviewableEvidence.summary}</p>
        <p className="text-xs font-mono break-all">File: {reviewableEvidence.sha256}<br />Evidence hash: {reviewableEvidence.evidenceHash}</p>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void campaignApi.evidenceFile(campaignId, reviewableEvidence.id).then(blob => {
          const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = reviewableEvidence.purpose === 'FINAL_PDF' ? 'review.pdf' : 'evidence'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        })}>Tải file để kiểm tra</button>
      </article>}
      {!reviewableEvidence && (state.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW || pendingProduction) && <p className="text-sm text-[var(--ink-subtle)]">Contract đã có hash nhưng indexer chưa gắn file evidence tương ứng.</p>}
      {reviewableEvidence && (state.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW || pendingProduction) && <div className="flex flex-wrap gap-2">
        {[true, false].map(accepted => <button key={String(accepted)} type="button" className="button button--secondary" disabled={busy} onClick={() => void transaction.send(
          state.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW ? 'reviewRelease' : 'reviewProduction',
          state.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW
            ? [activeId, state.pdfHash, state.releaseEvidenceHash, accepted]
            : [activeId, state.productionHash, accepted],
        )}>{accepted ? 'Duyệt' : 'Từ chối'} {state.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW ? 'PDF cuối' : 'bằng chứng sản xuất'}</button>)}
      </div>}
      <DisbursementPanel campaignId={campaignId} userId={userId} mode="resolver" chain={chain} transaction={transaction} onRefresh={onRefresh} />
    </section>;
  }

  if (section === 'activity') {
    return <section id="resolver-focus-disputes" className="monograph-card space-y-4" aria-labelledby="resolver-challenges-title">
      <span className="monograph-card__kicker">RESOLVER REVIEW · CHALLENGES</span>
      <h2 id="resolver-challenges-title" className="monograph-card__title">Tranh chấp &amp; khiếu nại</h2>
      <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">Lý do quyết định
        <textarea minLength={10} maxLength={2500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border border-[var(--border-hairline)] bg-white p-2.5 text-sm" />
      </label>
      {chain.challenges.length === 0 && <p className="text-sm text-[var(--ink-subtle)]">Chưa có challenge nào cần Resolver xử lý.</p>}
      {chain.challenges.map(challenge => <article key={challenge.backer} className="border-t border-[var(--border-hairline)] pt-3 space-y-2">
        <p className="text-xs break-all">{challenge.backer} · {challenge.resolved ? challenge.upheld ? 'Đã chấp nhận' : 'Đã bác' : 'Đang chờ xử lý'}<br />Evidence: {challenge.evidenceHash}</p>
        {!challenge.resolved && state.state === CAMPAIGN_CHAIN_STATE.RELEASED && <div className="flex flex-wrap gap-2">
          <button type="button" className="button button--secondary" disabled={busy || reason.trim().length < 10} onClick={() => void resolveChallenge(challenge.backer, true)}>Chấp nhận khiếu nại</button>
          <button type="button" className="button button--secondary" disabled={busy || reason.trim().length < 10} onClick={() => void resolveChallenge(challenge.backer, false)}>Bác khiếu nại</button>
        </div>}
      </article>)}
    </section>;
  }

  return <>
    <ActivationPanel
      mode="resolver"
      terms={terms}
      chain={chain}
      transaction={transaction.transaction?.action === 'approveCampaign' ? transaction.transaction : null}
      busy={busy}
      onRefresh={onRefresh}
      onActivate={onActivate}
      onReconcile={onReconcile}
    />
    {canFinalizeFunding && <div className="monograph-card space-y-2"><h2 className="monograph-card__title">Kết quả gây quỹ</h2><p className="text-sm">Deadline đã qua. Contract sẽ tự quyết định đạt hay không đạt dựa trên raised và goal.</p><button type="button" className="button button--secondary" disabled={busy} onClick={() => void transaction.send('finalizeFunding', [activeId])}>Chốt kết quả khi hết hạn gây quỹ</button></div>}
    {canStartRefunds && <div className="monograph-card space-y-2"><h2 className="monograph-card__title">Mở hoàn tiền</h2><p className="text-sm">Policy hoặc challenge đã đủ điều kiện mở refund.</p><button type="button" className="button button--secondary" disabled={busy} onClick={() => void transaction.send('startRefunds', [activeId])}>Mở hoàn tiền</button></div>}
    <CompletionSettlementPanel campaignId={campaignId} userId={userId} mode="resolver" chain={chain} transaction={transaction} onRefresh={onRefresh} />
  </>;
}

export type { ResolverTransactionController };
