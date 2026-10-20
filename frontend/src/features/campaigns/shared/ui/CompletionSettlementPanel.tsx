import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, type Abi, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import campaignAbiJson from '../../../../../../backend/src/blockchain/generated/campaigns/fund-together-campaign.abi.json';
import { campaignApi, type CampaignChain, type CampaignCompletionRequest, type CampaignSurplusClaim, type Entitlement } from '../../api/campaigns';
import { CAMPAIGN_CHAIN_STATE } from './campaignState';

const campaignAbi = campaignAbiJson as Abi;

interface CompletionTransaction {
  send: (functionName: string, args: readonly unknown[], options?: { expectedWallet?: string }) => Promise<void>;
  address?: Address;
  busy: boolean;
}

interface Props {
  campaignId: string;
  userId?: string;
  mode: 'public' | 'creator' | 'resolver';
  chain: CampaignChain;
  transaction: CompletionTransaction;
  entitlement?: Entitlement;
  onRefresh: () => void;
}

const money = (value?: string) => value ? `${formatUnits(BigInt(value), 6)} MockUSDC` : '—';
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function CompletionSettlementPanel({ campaignId, userId, mode, chain, transaction, entitlement, onRefresh }: Props) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionOutcome, setDecisionOutcome] = useState<'APPROVE' | 'CHANGES_REQUESTED' | 'REJECT'>('APPROVE');
  const [message, setMessage] = useState('');
  const client = usePublicClient({ chainId: 31339 });
  const snapshot = chain.snapshot;
  const activeId = chain.onchainCampaignId == null ? null : BigInt(chain.onchainCampaignId);
  const requests = useQuery({
    queryKey: ['campaign-completion-requests', campaignId, userId],
    queryFn: ({ signal }) => campaignApi.completionRequests(campaignId, signal),
    enabled: Boolean(userId && chain.status === 'ON_CHAIN_CONFIRMED'),
    refetchInterval: 5000,
  });
  const claims = useQuery({
    queryKey: ['campaign-surplus-claims', campaignId, userId],
    queryFn: ({ signal }) => campaignApi.surplusClaims(campaignId, signal),
    enabled: Boolean(userId && chain.status === 'ON_CHAIN_CONFIRMED'),
    refetchInterval: 5000,
  });
  const claimable = useQuery({
    queryKey: ['campaign-surplus-claimable', campaignId, entitlement?.backerWallet, snapshot?.surplusClaimed],
    queryFn: async () => BigInt(String(await client!.readContract({
      address: chain.deployment.contractAddress as Address,
      abi: campaignAbi,
      functionName: 'claimableSurplus',
      args: [activeId!, entitlement!.backerWallet as Address],
    }))),
    enabled: Boolean(client && activeId !== null && snapshot?.state === CAMPAIGN_CHAIN_STATE.COMPLETED && entitlement?.backerWallet),
    refetchInterval: 5000,
  });

  if (!userId || !snapshot || chain.status !== 'ON_CHAIN_CONFIRMED') return null;
  const creatorWallet = snapshot.creator;

  const latest = requests.data?.[0];
  const challengePassed = Boolean(chain.chainTimestamp && snapshot.challengeDeadline)
    && BigInt(chain.chainTimestamp) >= BigInt(snapshot.challengeDeadline);
  const eligible = snapshot.state === CAMPAIGN_CHAIN_STATE.RELEASED && challengePassed && snapshot.openDisputes === '0';
  const pendingRequest = latest?.status === 'DRAFT' ? latest : undefined;
  const reviewableRequest = latest && ['SUBMITTED_ON_CHAIN', 'UNDER_REVIEW'].includes(latest.status) ? latest : undefined;
  const canCreate = mode === 'creator' && eligible && (!latest || ['REJECTED', 'CHANGES_REQUESTED'].includes(latest.status));
  const canRetry = mode === 'creator' && eligible && Boolean(pendingRequest && activeId !== null);
  const canDecide = mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.COMPLETION_REQUESTED && Boolean(reviewableRequest && transaction.address);
  const ownClaim = claims.data?.find(claim => entitlement?.backerWallet && claim.backerWallet.toLowerCase() === entitlement.backerWallet.toLowerCase());
  const canClaim = mode === 'public' && snapshot.state === CAMPAIGN_CHAIN_STATE.COMPLETED && activeId !== null && Boolean(entitlement?.backerWallet) && !ownClaim && (claimable.data ?? 0n) > 0n;

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (activeId === null) return;
    setMessage('Đang lưu dossier hoàn thành riêng tư…');
    try {
      const dossier = await campaignApi.createCompletionRequest(campaignId, { title, summary, reason, files });
      await requests.refetch();
      setMessage('Dossier đã lưu. Hãy xác nhận requestCompletion trong ví.');
      await transaction.send('requestCompletion', [activeId, dossier.requestHash], { expectedWallet: creatorWallet });
      setFiles([]); setTitle(''); setSummary(''); setReason('');
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo dossier hoàn thành.');
    }
  }

  async function retryRequest() {
    if (!pendingRequest || activeId === null) return;
    setMessage('Đang gửi lại requestCompletion từ dossier đã lưu…');
    await transaction.send('requestCompletion', [activeId, pendingRequest.requestHash], { expectedWallet: creatorWallet });
    onRefresh();
  }

  async function prepareDecision(event: FormEvent) {
    event.preventDefault();
    if (!reviewableRequest || activeId === null || !transaction.address || !decisionReason.trim()) return;
    setMessage('Đang ghi nhận lý do quyết định…');
    try {
      const decision = await campaignApi.prepareCompletionDecision(reviewableRequest.id, { outcome: decisionOutcome, reason: decisionReason });
      await requests.refetch();
      const method = decisionOutcome === 'APPROVE' ? 'approveCompletion' : 'rejectCompletion';
      setMessage('Đã ghi nhận decision hash. Hãy xác nhận giao dịch trong ví; chờ receipt và indexer canonical.');
      await transaction.send(method, [activeId, reviewableRequest.requestHash, decision.decisionHash], { expectedWallet: transaction.address });
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể chuẩn bị quyết định hoàn thành.');
    }
  }

  async function download(request: CampaignCompletionRequest, fileId: string, originalName: string) {
    const blob = await campaignApi.completionFile(campaignId, request.id, fileId);
    saveBlob(blob, originalName);
  }

  async function claim(choice: 0 | 1) {
    if (!canClaim || activeId === null || !entitlement) return;
    setMessage(choice === 0 ? 'Đang gửi phần surplus về ví Backer…' : 'Đang gửi phần surplus cho Creator…');
    await transaction.send('claimSurplus', [activeId, choice], { expectedWallet: entitlement.backerWallet });
    await claims.refetch(); await claimable.refetch();
    onRefresh();
  }

  return (
    <section className="monograph-card space-y-4" aria-labelledby="completion-settlement-title">
      <span className="monograph-card__kicker">COMPLETION &amp; SURPLUS SETTLEMENT</span>
      <h2 id="completion-settlement-title" className="monograph-card__title">Hoàn thành &amp; quyết toán phần thừa</h2>
      <p className="monograph-card__desc">Resolver chỉ chốt campaign hoàn thành sau khi xem dossier. Contract trả đúng goal cho Creator; phần còn lại là surplus để từng Backer tự chọn.</p>
      {message && <p className="monograph-alert monograph-alert--info" role="status">{message}</p>}
      {requests.error && <p className="monograph-alert monograph-alert--error">Không đọc được dossier hoàn thành.</p>}
      {claims.error && <p className="monograph-alert monograph-alert--error">Không đọc được lịch sử claim surplus.</p>}

      {mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.ACTIVE && (
        <p className="monograph-alert monograph-alert--info">
          <strong>Chưa có hồ sơ hoàn thành để duyệt.</strong>{' '}
          {snapshot.productionApproved
            ? 'Đang chờ Creator gửi PDF cuối ở bước Sản xuất & bằng chứng.'
            : 'Đang chờ Creator gửi và được duyệt bằng chứng sản xuất trước khi gửi PDF cuối.'}
        </p>
      )}
      {mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.RELEASE_REVIEW && (
        <p className="monograph-alert monograph-alert--info">
          <strong>PDF cuối đang chờ duyệt.</strong> Hãy xử lý bản phát hành tại mục Sản xuất &amp; bằng chứng; nút duyệt hoàn thành chỉ mở sau hồ sơ completion riêng.
        </p>
      )}
      {mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.RELEASED && !eligible && (
        <p className="monograph-alert monograph-alert--info">
          {snapshot.openDisputes !== '0'
            ? 'Chưa thể chốt hoàn thành vì campaign còn tranh chấp mở.'
            : 'PDF cuối đã được duyệt. Đang chờ hết thời gian challenge trước khi Creator có thể gửi hồ sơ hoàn thành.'}
        </p>
      )}
      {mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.RELEASED && eligible && !latest && (
        <p className="monograph-alert monograph-alert--info">
          PDF cuối đã qua thời gian challenge. Đang chờ Creator gửi hồ sơ hoàn thành để Resolver xem và ký quyết định.
        </p>
      )}
      {mode === 'public' && snapshot.state !== CAMPAIGN_CHAIN_STATE.COMPLETED && (
        <p className="monograph-alert monograph-alert--info">
          <strong>Chưa thể nhận phần thừa.</strong> Resolver cần duyệt hồ sơ hoàn thành trước. Khi campaign chuyển sang COMPLETED, nút claim sẽ xuất hiện ngay tại đây trong Tổng quan.
        </p>
      )}

      {latest && (
        <article className="border border-[var(--border-hairline)] rounded p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>Revision #{latest.revision} · {latest.status}</strong><span>Goal: {money(snapshot.goal)}</span></div>
          <h3>{latest.title}</h3><p className="whitespace-pre-wrap">{latest.summary}</p><p><strong>Lý do:</strong> {latest.reason}</p>
          <p className="text-xs font-mono break-all">requestHash: {latest.requestHash}</p>
          <div className="space-y-1">{latest.files.map(file => <button key={file.id} type="button" className="button button--quiet button--sm" onClick={() => void download(latest, file.id, file.originalName)}>Xem file {file.originalName} · {file.sha256.slice(0, 12)}…</button>)}</div>
          {latest.decisions.map(decision => <p key={decision.id} className="text-sm border-t pt-2 mt-2"><strong>{decision.outcome}:</strong> {decision.reason}</p>)}
        </article>
      )}

      {canCreate && <form className="space-y-3" onSubmit={event => void submitRequest(event)}>
        <h3>Gửi hồ sơ hoàn thành</h3>
        <p className="text-sm text-[var(--ink-subtle)]">Không nhập số tiền hoặc địa chỉ nhận. Số tiền Creator nhận khi Resolver duyệt là đúng goal: {money(snapshot.goal)}.</p>
        <input required minLength={3} maxLength={200} placeholder="Tiêu đề hồ sơ" value={title} onChange={event => setTitle(event.target.value)} />
        <textarea required minLength={20} maxLength={2000} placeholder="Tóm tắt kết quả hoàn thành" value={summary} onChange={event => setSummary(event.target.value)} />
        <textarea required minLength={20} maxLength={5000} placeholder="Lý do đề nghị chốt hoàn thành" value={reason} onChange={event => setReason(event.target.value)} />
        <input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={event => setFiles(Array.from(event.target.files ?? []))} />
        <button disabled={transaction.busy} className="button button--primary" type="submit">Lưu hồ sơ và ký requestCompletion</button>
      </form>}
      {canRetry && <button disabled={transaction.busy} className="button button--primary" type="button" onClick={() => void retryRequest()}>Tiếp tục ký requestCompletion</button>}
      {mode === 'creator' && latest && ['SUBMITTED_ON_CHAIN', 'UNDER_REVIEW'].includes(latest.status) && <p className="text-sm text-[var(--ink-subtle)]">Đã gửi canonical. Chờ Resolver xem hồ sơ và quyết định.</p>}

      {mode === 'resolver' && reviewableRequest && <form className="space-y-3" onSubmit={event => void prepareDecision(event)}>
        <h3>Quyết định Resolver</h3>
        <p className="text-sm">Duyệt sẽ trả đúng goal {money(snapshot.goal)} cho ví Creator đã khóa; surplus vẫn để Backer claim theo tỷ lệ đóng góp. Không có countdown cố định cho Resolver.</p>
        <select value={decisionOutcome} onChange={event => setDecisionOutcome(event.target.value as typeof decisionOutcome)}>
          <option value="APPROVE">Duyệt hoàn thành</option><option value="CHANGES_REQUESTED">Yêu cầu sửa hồ sơ</option><option value="REJECT">Từ chối</option>
        </select>
        <textarea required minLength={10} maxLength={3000} placeholder="Lý do quyết định" value={decisionReason} onChange={event => setDecisionReason(event.target.value)} />
        <button disabled={!canDecide || transaction.busy} className="button button--primary" type="submit">Ghi quyết định và ký on-chain</button>
      </form>}
      {mode === 'resolver' && snapshot.state === CAMPAIGN_CHAIN_STATE.COMPLETION_REQUESTED && !reviewableRequest && <p className="text-sm text-[var(--ink-subtle)]">Contract đã nhận requestCompletion nhưng indexer chưa gắn dossier; chờ đồng bộ rồi thử lại.</p>}

      {snapshot.state === CAMPAIGN_CHAIN_STATE.COMPLETED && <div className="space-y-2">
        <p className="monograph-alert monograph-alert--success">Campaign đã hoàn thành canonical. Creator nhận đúng goal {money(snapshot.goal)}; surplus pool hiện còn {money(snapshot.surplusPool)}.</p>
        <p className="text-sm">Đã claim: {money(snapshot.surplusClaimed)} · Số Backer đã claim: {snapshot.surplusClaimantCount}/{snapshot.backerCount}</p>
        {mode === 'public' && !entitlement && <p className="monograph-alert monograph-alert--info">Campaign đã mở quyết toán nhưng tài khoản hiện tại không có pledge canonical. Hãy đăng nhập bằng tài khoản và ví đã dùng để pledge; nút claim nằm tại đây trong Tổng quan.</p>}
        {mode === 'public' && entitlement && (
          ownClaim
            ? <p className="text-sm text-[var(--ink-subtle)]">Bạn đã chọn {ownClaim.choice === 'REFUND_TO_BACKER' ? 'hoàn về ví Backer' : 'gửi cho Creator'}: {money(ownClaim.amount)}.</p>
            : <div className="space-y-2">
              <p className="text-sm">Phần surplus theo đóng góp của bạn: <strong>{claimable.isPending ? 'Đang tính…' : money(String(claimable.data ?? 0n))}</strong></p>
              {!claimable.isPending && (claimable.data ?? 0n) === 0n
                ? <p className="text-sm text-[var(--ink-subtle)]">Không còn phần surplus có thể claim cho ví pledge này.</p>
                : <div className="flex flex-wrap gap-2"><button disabled={!canClaim || transaction.busy} className="button button--primary" type="button" onClick={() => void claim(0)}>Nhận về ví của tôi</button><button disabled={!canClaim || transaction.busy} className="button button--secondary" type="button" onClick={() => void claim(1)}>Gửi cho Creator</button></div>}
            </div>
        )}
        {mode !== 'public' && claims.data && claims.data.length > 0 && <div className="space-y-1">{claims.data.map((claim: CampaignSurplusClaim) => <p className="text-sm border-t pt-2" key={claim.id}>{claim.backerWallet} · {claim.choice === 'REFUND_TO_BACKER' ? 'Backer nhận lại' : 'Creator nhận'} · {money(claim.amount)}</p>)}</div>}
      </div>}
      {snapshot.state === CAMPAIGN_CHAIN_STATE.RELEASED && mode === 'creator' && !eligible && <p className="text-sm text-[var(--ink-subtle)]">Chưa đủ điều kiện gửi hồ sơ hoàn thành: cần hết challenge deadline và không còn tranh chấp mở.</p>}
    </section>
  );
}
