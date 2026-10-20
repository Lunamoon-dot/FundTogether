import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountSession } from '../../../lib/api/auth';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useTransaction } from '../transactions/useTransaction';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { ReviewThread } from '../shared/ui/ReviewThread';
import { CommunityPanel } from '../public/Community';
import { InternalCampaignFrame } from '../shared/workspace/InternalCampaignFrame';
import { CampaignDossierList } from '../shared/detail/CampaignDossierList';
import { DisbursementPanel } from '../shared/ui/DisbursementPanel';
import { CreatorCampaignActions, CreatorLedgerActions } from './CampaignActions';
import '../shared/styles.css';

const zeroHash = `0x${'0'.repeat(64)}`;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface CreatorCampaignWorkspacePageProps {
  id: string;
  session: AccountSession;
  initialTab?: 'overview' | 'production' | 'commitments' | 'activity';
}

export function CreatorCampaignWorkspacePage({ id, session, initialTab = 'overview' }: CreatorCampaignWorkspacePageProps): React.ReactElement {
  const userId = session.userId;
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'creator', session.userId],
    queryFn: ({ signal }) => campaignApi.operations('creator', signal),
    enabled: Boolean(session.userId),
    refetchInterval: 10000,
  });
  const ownsCampaign = Boolean(operations.data?.some(operation => operation.campaignId === id));
  const preview = useQuery({
    queryKey: ['campaign-campaign-public', id],
    queryFn: ({ signal }) => campaignApi.preview(id, signal),
  });
  const approved = preview.data?.status === 'APPROVED' || preview.data?.status === 'PUBLISHED';
  const chain = useQuery({
    queryKey: ['campaign-campaign-chain', id],
    queryFn: ({ signal }) => campaignApi.chain(id, signal),
    enabled: approved,
    refetchInterval: 10000,
  });
  const publicationTerms = useQuery({
    queryKey: ['campaign-campaign-publication-terms', id, session.userId],
    queryFn: () => campaignApi.terms(id),
    enabled: approved && ownsCampaign && Boolean(chain.data && ['NOT_PUBLISHED', 'ORPHANED'].includes(chain.data.status)),
  });
  const evidence = useQuery({
    queryKey: ['campaign-campaign-evidence', id, session.userId],
    queryFn: ({ signal }) => campaignApi.evidence(id, true, signal),
    enabled: approved && ownsCampaign && chain.data?.status === 'ON_CHAIN_CONFIRMED',
  });
  const [activeTab, setActiveTab] = useState(initialTab);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [completionDeadline, setCompletionDeadline] = useState('');
  const refresh = () => {
    void operations.refetch();
    void chain.refetch();
    void publicationTerms.refetch();
    void evidence.refetch();
  };
  const tx = useTransaction(refresh, { userId, campaignId: id });
  const busy = working || tx.busy;
  const state = chain.data?.snapshot;
  const productionFunded = state != null && BigInt(state.creatorPaid ?? '0') > 0n;
  const activeId = chain.data?.onchainCampaignId == null ? null : BigInt(chain.data.onchainCampaignId);
  const chainNow = chain.data?.chainTimestamp ? BigInt(chain.data.chainTimestamp) : null;
  const completionMinimumDate = chainNow == null
    ? new Date().toISOString().slice(0, 10)
    : new Date(Number(chainNow) * 1000).toISOString().slice(0, 10);
  const completionDeadlineSeconds = completionDeadline
    ? BigInt(Math.floor(new Date(`${completionDeadline}T23:59:59Z`).getTime() / 1000))
    : null;
  const completionDeadlineExpired = chainNow != null && completionDeadlineSeconds != null && completionDeadlineSeconds <= chainNow;
  const productionTransactionMessage =
    (tx.transaction?.action === 'submitProduction' || tx.transaction?.action === 'submitRelease')
      ? (tx.error || tx.notice)
      : '';
  const completionTransactionMessage =
    tx.transaction?.action === 'confirmCampaignCompletion'
      ? (tx.error || tx.notice)
      : '';

  async function work(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }

  async function activate() {
    await work(async () => {
      const result = await publicationTerms.refetch();
      if (!result.data) throw new Error('Chưa đọc được cam kết phát hành; hãy tải lại trang.');
      if (!result.data.onchainApproved) throw new Error('Judge case chưa đạt quorum APPROVED trên chain.');
      await tx.send('createCampaign', [result.data.commitmentHash, BigInt(result.data.goal), BigInt(result.data.price), BigInt(result.data.fundingDuration)], { expectedWallet: result.data.creatorWallet });
    });
  }

  async function upload() {
    await work(async () => {
      if (!file || !state || !productionFunded) return;
      await campaignApi.upload(id, state.productionApproved ? 'FINAL_PDF' : 'PRODUCTION_EVIDENCE', summary, file);
      setNotice('Đã lưu file riêng tư. Kiểm tra file và hash, rồi gửi yêu cầu thẩm định trên hợp đồng.');
      setFile(null); setSummary(''); await evidence.refetch();
    });
  }

  if (operations.isPending) return <p role="status">Đang xác nhận quyền Creator…</p>;
  if (operations.error || !ownsCampaign) return <section className="panel review-notice review-notice--blocked" role="alert"><h1>Không có quyền mở workspace Creator</h1><p>Campaign này không thuộc tài khoản Creator hiện tại. Dữ liệu evidence và hồ sơ riêng tư chưa được đọc.</p></section>;
  if (preview.isPending) return <p role="status">Đang tải campaign…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;

  const item = preview.data;
  const onchainId = chain.data?.onchainCampaignId;
  const timelineEvents: TimelineEvent[] = [
    { label: 'Chuẩn bị hồ sơ', detail: 'Hồ sơ đã khóa và kiểm tra bản quyền', tone: 'done' },
    { label: 'Thẩm định hồ sơ', detail: approved ? 'Resolver đã phê duyệt' : 'Đang lấy ý kiến hoặc chờ thẩm định', tone: approved ? 'done' : 'current' },
    { label: 'Gây quỹ on-chain', detail: state ? state.state === 0 ? 'Đang mở gây quỹ trên hợp đồng' : state.state === 4 ? 'Đang hoàn tiền cho Backer' : 'Giai đoạn gây quỹ hoàn tất' : 'Chờ kích hoạt campaign trên hợp đồng', tone: !state ? 'pending' : state.state === 0 ? 'current' : 'done' },
  ];
  if (state?.state === 4) timelineEvents.push({ label: 'Hoàn tiền', detail: 'Campaign không đạt mục tiêu; Creator không có thao tác payout', tone: 'current' });
  else timelineEvents.push({ label: 'Sản xuất & Duyệt PDF', detail: state?.productionApproved ? 'Bằng chứng sản xuất đã được Resolver duyệt' : 'Creator cập nhật bằng chứng sản xuất', tone: state?.productionApproved ? 'done' : state && state.state >= 1 ? 'current' : 'pending' });
  const alerts = <>
    {[error, tx.error, chain.error && getErrorMessage(chain.error), publicationTerms.error && getErrorMessage(publicationTerms.error), evidence.error && getErrorMessage(evidence.error)].filter(Boolean).map((message, index) => <div key={index} role="alert" className="monograph-alert monograph-alert--error mt-4">{String(message)}</div>)}
    {notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{notice}</div>}
    {tx.notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{tx.notice}</div>}
  </>;

  return (
    <InternalCampaignFrame
      role="creator"
      campaign={item}
      chain={chain.data ?? null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      alerts={alerts}
      actions={chain.data ? <CreatorLedgerActions chain={chain.data} transaction={tx} /> : null}
      main={
        <>
          {activeTab === 'overview' && <>
            <div className="monograph-card"><span className="monograph-card__kicker">HỒ SƠ THẨM ĐỊNH (EDITORIAL DOSSIER)</span><h2 className="monograph-card__title">Tài liệu sản xuất &amp; Kế hoạch cam kết</h2><p className="monograph-card__desc">Hồ sơ riêng của Creator, được Resolver xem xét trước khi mở gây quỹ.</p><CampaignDossierList contentOutline={item.contentOutline} budgetPlan={item.budgetPlan} evidencePlan={item.evidencePlan} /></div>
            {chain.data && <CreatorCampaignActions campaignId={id} userId={userId} chain={chain.data} terms={publicationTerms.data} transaction={tx} busy={busy || publicationTerms.isFetching} onRefresh={refresh} onActivate={() => void activate()} onReconcile={() => { if (tx.transaction?.txHash) void tx.reconcile(); else if (chain.data?.bindingTransactionHash) void tx.reconcile('createCampaign', chain.data.bindingTransactionHash); else void chain.refetch(); }} />}
          </>}

          {activeTab === 'production' && <div className="space-y-6">
            {state && state.state !== 4 && <div className="monograph-card space-y-4">
              <span className="monograph-card__kicker">QUY TRÌNH SẢN XUẤT</span>
              <h2 className="monograph-card__title">Bằng chứng &amp; bản PDF cuối</h2>
              <p className="monograph-card__pitch">{state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : 'Bằng chứng sản xuất chưa được duyệt.'} Creator gửi hồ sơ tại đây; Resolver sẽ xem xét ở workspace riêng.</p>
              {productionTransactionMessage && <p className={`monograph-alert ${tx.error ? 'monograph-alert--error' : 'monograph-alert--info'}`} role={tx.error ? 'alert' : 'status'}>{productionTransactionMessage}</p>}
              {state.state === 1 && state.productionApproved && BigInt(state.releaseDeadline) > 0n && state.pdfHash === zeroHash && <div className="monograph-alert monograph-alert--info" role="status"><strong>Bước tiếp theo: gửi PDF cuối.</strong> Creator đã chốt hạn phát hành PDF. Hãy tải PDF cuối lên, lưu hash rồi gửi Resolver duyệt; đây chưa phải yêu cầu hoàn thành campaign.</div>}
              {state.state === 1 && (!state.productionApproved || BigInt(state.releaseDeadline) > 0n) && <form onSubmit={event => { event.preventDefault(); void upload(); }} className="space-y-3 pt-2" aria-disabled={!productionFunded}>
                {!productionFunded && <div className="rounded border border-[var(--border-hairline)] bg-[var(--paper-bone)] p-3 text-sm" role="status"><strong>Chưa có giải ngân được Resolver duyệt.</strong> Form sản xuất sẽ mở sau khi yêu cầu giải ngân lần 1 được phê duyệt on-chain.</div>}
                <fieldset disabled={busy || !productionFunded} className="space-y-3 border-0 p-0 m-0">
                  <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">{state.productionApproved ? 'PDF cuối riêng tư' : 'Bằng chứng sản xuất riêng tư'} · tối đa 10 MiB<input type="file" accept="application/pdf,image/png,image/jpeg" required onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-[var(--ink-lead)]" /></label>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">Tóm tắt công khai, không ghi thông tin riêng tư<textarea required minLength={20} maxLength={5000} value={summary} onChange={event => setSummary(event.target.value)} className="mt-1 block w-full rounded border border-[var(--border-hairline)] bg-white p-2.5 text-sm" /></label>
                  <button disabled={busy || !file || !productionFunded} className="button button--primary">Lưu file và hash</button>
                </fieldset>
              </form>}
              {state.state === 1 && state.productionApproved && BigInt(state.releaseDeadline) === 0n && <div className="rounded border border-[var(--border-hairline)] bg-[var(--paper-bone)] p-3 space-y-2"><p className="text-sm font-semibold m-0">Chốt hạn phát hành PDF</p><p className="text-sm m-0 text-[var(--ink-subtle)]">Giao dịch này chỉ ghi hạn phát hành PDF lên chain; chưa gửi hồ sơ hoàn thành cho Resolver.</p>{completionTransactionMessage && <p className={`monograph-alert ${tx.error ? 'monograph-alert--error' : 'monograph-alert--info'}`} role={tx.error ? 'alert' : 'status'}>{completionTransactionMessage}</p>}{completionDeadlineExpired && <p className="monograph-alert monograph-alert--error" role="alert">Hạn đã chọn nằm trước thời gian hiện tại của chain ({new Date(Number(chainNow) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}). Chọn ngày từ {completionMinimumDate} trở đi.</p>}<label className="block text-xs font-mono uppercase tracking-wider">Hạn cam kết phát hành PDF (UTC)<input type="date" value={completionDeadline} min={completionMinimumDate} onChange={event => setCompletionDeadline(event.target.value)} className="mt-1 block rounded border p-2 text-sm" /></label><button type="button" disabled={busy || !completionDeadline || completionDeadlineExpired || activeId === null} className="button button--primary" onClick={() => void work(async () => { const deadline = BigInt(Math.floor(new Date(`${completionDeadline}T23:59:59Z`).getTime() / 1000)); await tx.send('confirmCampaignCompletion', [activeId, deadline], { expectedWallet: state.creator }); })}>Ký chốt hạn phát hành PDF</button></div>}
              {evidence.data?.map(proof => <div key={proof.id} className="border-t border-[var(--border-hairline)] pt-3.5 space-y-1.5"><h3 className="text-sm font-semibold m-0">{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</h3><p className="text-sm m-0">{proof.summary}</p><p className="text-xs font-mono break-all bg-[var(--paper-bone)] p-2 rounded">File: {proof.sha256}<br />Bằng chứng: {proof.evidenceHash}</p><button type="button" disabled={busy} className="button button--secondary" onClick={() => void work(async () => saveBlob(await campaignApi.evidenceFile(id, proof.id), proof.mediaType === 'application/pdf' ? 'review.pdf' : 'evidence.png'))}>Tải file để kiểm tra</button>{state.state === 1 && <button type="button" disabled={busy || !productionFunded || activeId === null} className="button button--primary" onClick={() => void tx.send(proof.purpose === 'FINAL_PDF' ? 'submitRelease' : 'submitProduction', proof.purpose === 'FINAL_PDF' ? [activeId, proof.sha256, proof.evidenceHash] : [activeId, proof.evidenceHash], { expectedWallet: state.creator })}>{proof.purpose === 'FINAL_PDF' ? 'Gửi PDF cuối để Resolver duyệt' : 'Gửi bằng chứng sản xuất để Resolver duyệt'}</button>}</div>)}
            </div>}
            {chain.data && <DisbursementPanel campaignId={id} userId={userId} mode="creator" chain={chain.data} transaction={tx} onRefresh={refresh} />}
          </div>}

          {activeTab === 'commitments' && <div className="space-y-6"><div className="monograph-card space-y-4"><span className="monograph-card__kicker">VÒNG ĐỜI DỰ ÁN</span><h2 className="monograph-card__title">Tiến trình vòng đời</h2><Timeline events={timelineEvents} /></div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">NỘI DUNG TÁC PHẨM</span><h2 className="monograph-card__title">Cốt truyện &amp; Tác phẩm</h2><p className="text-[14.5px] text-[var(--ink-lead)] leading-relaxed whitespace-pre-wrap m-0 font-serif">{item.config.story}</p></div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">MINH BẠCH ON-CHAIN</span><h2 className="monograph-card__title">Cam kết mã hóa</h2><code className="font-mono text-xs break-all">{item.commitmentHash}</code></div></div>}

          {activeTab === 'activity' && userId && state?.state !== 4 && <div className="space-y-6">{state && <ReviewThread campaignId={id} userId={userId} viewerMode="creator" targetHash={state.productionHash !== zeroHash ? state.productionHash : item.commitmentHash} />}{<CommunityPanel id={id} userId={userId} viewerMode="creator" commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} />}</div>}

          {chain.data && <details className="monograph-technical-details"><summary>Chi tiết kỹ thuật &amp; hợp đồng</summary><div className="monograph-technical-details__body">Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />{onchainId && <>ID on-chain: <code>#{onchainId}</code></>}</div></details>}
        </>
      }
    />
  );
}

