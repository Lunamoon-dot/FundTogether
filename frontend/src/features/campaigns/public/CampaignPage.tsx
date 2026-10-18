import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, keccak256, toHex } from 'viem';
import type { AccountSession } from '../../../lib/api/auth';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useTransaction } from '../transactions/useTransaction';
import { getCampaignUiState } from '../shared/ui/campaignState';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { ReviewThread } from '../shared/ui/ReviewThread';
import { CommunityPanel, FeedbackComposerModal } from './Community';
import { CampaignDetailFrame } from '../shared/detail/CampaignDetailFrame';
import { CampaignOverview } from '../shared/detail/CampaignOverview';
import { CampaignLedger } from '../shared/detail/CampaignLedger';
import { CampaignDossierList } from '../shared/detail/CampaignDossierList';
import { BackerCampaignActions } from '../backer/CampaignActions';
import '../shared/styles.css';

const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
const zeroHash = `0x${'0'.repeat(64)}`;

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PublicCampaignPageProps {
  id: string;
  session: AccountSession | null;
  initialTab?: 'overview' | 'production' | 'commitments' | 'activity';
}

export function PublicCampaignPage({ id, session, initialTab = 'overview' }: PublicCampaignPageProps): React.ReactElement {
  const userId = session?.userId;
  const preview = useQuery({
    queryKey: ['campaign-campaign-public', id],
    queryFn: ({ signal }) => campaignApi.preview(id, signal),
  });
  const approved = preview.data?.status === 'APPROVED';
  const campaignApproved = approved || preview.data?.status === 'PUBLISHED';
  const communityReview = preview.data?.status === 'COMMUNITY_REVIEW';
  const chain = useQuery({
    queryKey: ['campaign-campaign-chain', id],
    queryFn: ({ signal }) => campaignApi.chain(id, signal),
    enabled: campaignApproved,
    refetchInterval: 10000,
  });
  const evidence = useQuery({
    queryKey: ['campaign-campaign-evidence', id, 'public'],
    queryFn: ({ signal }) => campaignApi.evidence(id, false, signal),
    enabled: campaignApproved && chain.data?.status === 'ON_CHAIN_CONFIRMED',
  });
  const entitlements = useQuery({
    queryKey: ['campaign-campaign-entitlements', userId],
    queryFn: ({ signal }) => campaignApi.entitlements(signal),
    enabled: Boolean(userId) && campaignApproved,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState('');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [feedbackComposerOpen, setFeedbackComposerOpen] = useState(false);
  const refresh = () => {
    void chain.refetch();
    void evidence.refetch();
    void entitlements.refetch();
  };
  const tx = useTransaction(refresh, { userId, campaignId: id });
  const busy = working || tx.busy;
  const state = chain.data?.snapshot;
  const own = entitlements.data?.find(item => item.campaignId === id && item.access !== 'ORPHANED');
  const onchainId = chain.data?.onchainCampaignId;
  const activeId = onchainId == null ? null : BigInt(onchainId);
  const postFundingState = Boolean(chain.data?.status === 'ON_CHAIN_CONFIRMED' && state && [1, 2, 3, 5, 6].includes(state.state));
  const fundedParticipant = Boolean(own && !['ORPHANED', 'REFUNDED'].includes(own.access));
  const showPostFundingReview = Boolean(userId && postFundingState && fundedParticipant);
  const postFundingTarget = state && state.productionHash !== zeroHash ? state.productionHash : (preview.data?.commitmentHash ?? '');

  async function work(action: () => Promise<void>) {
    setWorking(true);
    setError('');
    setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }

  async function download() {
    await work(async () => {
      if (!own) return;
      const access = await campaignApi.ticket(own.id);
      const blob = await campaignApi.download(access.url);
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = `0x${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      if (sha256 !== access.sha256) throw new Error('File tải về không khớp hash đã duyệt; báo sự cố cho Resolver.');
      saveBlob(blob, 'campaign.pdf');
      setNotice('Đã nhận PDF đúng hash. Lượt tải không được xem là bạn đã chấp nhận tác phẩm.');
    });
  }

  if (preview.isPending) return <p role="status">Đang tải cam kết PDF…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;
  const item = preview.data;
  const uiState = getCampaignUiState({
    status: item.status,
    chainState: state?.state,
    publicationStatus: item.surface === 'ORPHANED' ? 'ORPHANED' : chain.data?.status ?? null,
    access: own?.access,
    role: 'backer',
  });
  const timelineEvents: TimelineEvent[] = [
    { label: 'Chuẩn bị hồ sơ', detail: 'Hồ sơ đã khóa và kiểm tra bản quyền', tone: 'done' },
    { label: 'Thẩm định hồ sơ', detail: campaignApproved ? 'Resolver đã phê duyệt' : 'Đang lấy ý kiến hoặc chờ thẩm định', tone: campaignApproved ? 'done' : 'current' },
    {
      label: 'Gây quỹ on-chain',
      detail: state ? (state.state === 0 ? 'Đang mở gây quỹ trên hợp đồng' : state.state === 4 ? 'Không đạt mục tiêu · Contract đã chuyển sang hoàn tiền' : 'Giai đoạn gây quỹ hoàn tất') : 'Chờ kích hoạt campaign trên hợp đồng',
      tone: !state ? 'pending' : state.state === 0 ? 'current' : 'done',
    },
  ];
  if (state?.state === 4) timelineEvents.push({ label: 'Hoàn tiền', detail: 'Campaign không đạt mục tiêu · Backer tự nhận hoàn tiền', tone: 'current' });
  else timelineEvents.push({ label: 'Sản xuất & Duyệt PDF', detail: state ? (state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : state.state >= 1 && state.state <= 3 ? 'Creator đang sản xuất và nộp bằng chứng' : 'Chờ sau giai đoạn gây quỹ') : 'Chờ sau giai đoạn gây quỹ', tone: state?.productionApproved ? 'done' : state && state.state >= 1 && state.state <= 3 ? 'current' : 'pending' });

  const alerts = <>
    {[error, tx.error, chain.error && getErrorMessage(chain.error), evidence.error && getErrorMessage(evidence.error), entitlements.error && getErrorMessage(entitlements.error)].filter(Boolean).map((message, index) => <div key={index} role="alert" className="monograph-alert monograph-alert--error mt-4">{String(message)}</div>)}
    {notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{notice}</div>}
    {tx.notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{tx.notice}</div>}
    {!userId && <div className="monograph-alert monograph-alert--info mt-4"><a href="#/account" className="underline font-semibold">Đăng nhập</a> để góp ý, liên kết ví và ủng hộ bằng MockUSDC local.</div>}
    {state?.state === 4 && <div className="monograph-alert monograph-alert--warning mt-6 space-y-1"><div className="flex items-center gap-2 font-semibold"><span aria-hidden="true">⚠</span><span>Campaign không đạt mục tiêu — đang hoàn tiền</span></div><p className="text-sm m-0">Chiến dịch đang trong trạng thái hoàn tiền. Backer tự thực hiện claim refund.</p></div>}
  </>;

  return (
    <>
      <CampaignDetailFrame
        campaignId={id}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alerts={alerts}
        main={
          <>
            <CampaignOverview campaign={item} chain={chain.data ?? null} uiState={uiState} timelineEvents={timelineEvents} showDetails={activeTab === 'overview'} />
            {activeTab === 'overview' && (
              <>
                <div className="monograph-card">
                  <span className="monograph-card__kicker">HỒ SƠ THẨM ĐỊNH (EDITORIAL DOSSIER)</span>
                  <h2 className="monograph-card__title">Tài liệu sản xuất &amp; Kế hoạch cam kết</h2>
                  <p className="monograph-card__desc">Các tài liệu minh chứng do auteur cam kết và được Resolver thẩm định kỹ lưỡng trước khi mở gây quỹ.</p>
                  <CampaignDossierList contentOutline={item.contentOutline} budgetPlan={item.budgetPlan} evidencePlan={item.evidencePlan} />
                </div>
                {own && state && state.state !== 4 && (
                  <div className="monograph-card space-y-3">
                    <span className="monograph-card__kicker">QUYỀN LỢI ĐÃ MỞ (BACKER ENTITLEMENT)</span>
                    <h2 className="monograph-card__title">Quyền PDF của bạn</h2>
                    <p className="monograph-card__pitch">{own.access === 'DOWNLOAD_ELIGIBLE' ? 'PDF đã sẵn sàng' : own.access === 'DELIVERY_UNAVAILABLE' ? 'PDF cần Resolver kiểm tra' : own.access === 'PENDING_RELEASE' ? 'Đang chờ PDF' : own.access} · <strong>{amount(own.amountPaid)}</strong></p>
                    {own.access === 'DOWNLOAD_ELIGIBLE' && <div className="flex flex-wrap gap-2.5 pt-1"><button disabled={busy} className="button button--primary" onClick={() => void download()}>Kiểm tra và tải PDF riêng tư</button><button disabled={busy || Boolean(own.confirmedAt)} className="button button--secondary" onClick={() => void work(async () => { await campaignApi.confirm(own.id); await entitlements.refetch(); })}>{own.confirmedAt ? 'BACKER_CONFIRMED' : 'Tôi đã kiểm tra và xác nhận PDF'}</button></div>}
                    <p className="text-xs text-[var(--ink-subtle)] m-0">Lượt tải là nhật ký truy cập. Xác nhận của bạn là phản hồi riêng, không tự giải ngân.</p>
                  </div>
                )}
                {state?.productionApproved && <div className="rounded-lg border border-[var(--border-hairline)] p-3.5 bg-[#f0fdf4] text-xs text-[#166534] font-medium flex items-center gap-2"><span aria-hidden="true">✓</span><span>EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.</span></div>}
                {communityReview && <div className="monograph-card space-y-2"><span className="monograph-card__kicker">GIAI ĐOẠN ĐÁNH GIÁ</span><h2 className="monograph-card__title">Community review đang mở</h2><p className="monograph-card__pitch">Community chỉ gửi phản hồi tham khảo; Resolver là người quyết định. Hồ sơ chưa mở pledge.</p><p className="text-xs text-[var(--ink-subtle)] m-0">Hồ sơ chỉ xuất hiện ở đây sau khi Resolver chủ động mở community review.</p>{userId && <button type="button" className="button button--primary mt-2" onClick={() => setFeedbackComposerOpen(true)}>Gửi góp ý</button>}</div>}
              </>
            )}

            {activeTab === 'production' && <div className="space-y-6">{state && state.state !== 4 && <div className="monograph-card space-y-4"><span className="monograph-card__kicker">QUY TRÌNH SẢN XUẤT</span><h2 className="monograph-card__title">Bằng chứng &amp; bản PDF cuối</h2><p className="monograph-card__pitch">{state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : 'Bằng chứng sản xuất chưa được duyệt.'} Đây là hồ sơ tiến độ công khai sau khi campaign hoạt động. Việc duyệt sản xuất chưa mở quyền tải PDF.</p>{evidence.data?.map(proof => <div key={proof.id} className="border-t border-[var(--border-hairline)] pt-3.5 space-y-1.5"><h3 className="text-sm font-semibold text-[var(--ink-carbon)] m-0">{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</h3><p className="text-sm text-[var(--ink-lead)] m-0">{proof.summary}</p><p className="text-xs font-mono text-[var(--ink-subtle)] m-0 break-all bg-[var(--paper-bone)] p-2 rounded border border-[var(--border-hairline-subtle)]">Bằng chứng: {proof.evidenceHash}</p></div>)}</div>}</div>}

            {activeTab === 'commitments' && <div className="space-y-6"><div className="monograph-card space-y-4"><span className="monograph-card__kicker">VÒNG ĐỜI DỰ ÁN</span><h2 className="monograph-card__title">Tiến trình vòng đời</h2><Timeline events={timelineEvents} /></div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">NỘI DUNG TÁC PHẨM</span><h2 className="monograph-card__title">Cốt truyện &amp; Tác phẩm</h2><p className="text-[14.5px] text-[var(--ink-lead)] leading-relaxed whitespace-pre-wrap m-0 font-serif">{item.config.story}</p></div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">MINH BẠCH ON-CHAIN</span><h2 className="monograph-card__title">Cam kết mã hóa</h2><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-[var(--ink-subtle)] font-medium">Commitment Hash:</span><code className="font-mono text-xs bg-[var(--paper-bone)] text-[var(--ink-carbon)] px-2.5 py-1 rounded border border-[var(--border-hairline)] break-all select-all">{item.commitmentHash}</code></div>{item.decisions.length > 0 && <div className="pt-2 space-y-2"><span className="text-xs text-[var(--ink-subtle)] font-medium">Quyết định thẩm định:</span><div className="flex flex-wrap gap-2">{item.decisions.map((decision, index) => <div key={index} className="inline-flex items-center gap-1.5 text-xs bg-[var(--paper-bone)] text-[var(--ink-carbon)] px-2.5 py-1 rounded border border-[var(--border-hairline)]"><span className="font-semibold">Resolver: {decision.outcome}</span><span className="text-[var(--ink-subtle)]">· {decision.reviewedAt}</span></div>)}</div></div>}</div></div>}

            {activeTab === 'activity' && <div className="space-y-6">{userId && state && state.state !== 4 && (state.state === 3 || chain.data!.challenges.length > 0) && <div className="monograph-card space-y-3"><span className="monograph-card__kicker">TRANH CHẤP &amp; KHIẾU NẠI</span><h2 className="monograph-card__title">Challenge trước khi chốt hoàn thành</h2><label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">Lý do / bằng chứng chi tiết gửi Resolver<textarea minLength={10} maxLength={2500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border border-[var(--border-hairline)] bg-white p-2.5 text-sm text-[var(--ink-carbon)] focus:outline-none focus:border-[var(--seal-vermilion)]" /></label>{own && state.state === 3 && <button disabled={busy || reason.trim().length < 10} className="button button--secondary" onClick={() => void work(async () => { await campaignApi.comment(id, { targetHash: state.releaseEvidenceHash, kind: 'ISSUE', body: reason }); await tx.send('challengeRelease', [activeId, keccak256(toHex(JSON.stringify(['campaigns-challenge-v1', id, state.releaseEvidenceHash, reason])))], { expectedWallet: own.backerWallet }); })}>Gửi báo cáo và challenge bằng ví đã pledge</button>}{chain.data!.challenges.map(challenge => <div key={challenge.backer} className="border-t border-[var(--border-hairline)] pt-3 space-y-1"><p className="text-xs text-[var(--ink-lead)] m-0 break-all">{challenge.backer} · {challenge.resolved ? challenge.upheld ? 'Chấp nhận khiếu nại' : 'Bác khiếu nại' : 'Đang chờ Resolver'}<br />Bằng chứng: {challenge.evidenceHash}</p></div>)}<p className="text-xs text-[var(--ink-subtle)] m-0">Hết hạn challenge hoặc đã chốt hoàn thành: báo sự cố qua phản hồi bên dưới.</p></div>}{userId && state?.state !== 4 && (showPostFundingReview ? <ReviewThread campaignId={id} userId={userId} viewerMode="backer" targetHash={postFundingTarget} /> : <CommunityPanel id={id} userId={userId} viewerMode="community" commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} />)}</div>}

            <details className="monograph-technical-details"><summary>Chi tiết kỹ thuật &amp; hợp đồng</summary><div className="monograph-technical-details__body">Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />{onchainId && <>ID on-chain: <code>#{onchainId}</code></>}</div></details>
          </>
        }
        ledger={<CampaignLedger campaign={item} chain={chain.data ?? null} actions={chain.data ? <BackerCampaignActions campaignId={id} session={session} chain={chain.data} entitlement={own} transaction={tx} onRefresh={refresh} /> : null} />}
      />
      {feedbackComposerOpen && userId && <FeedbackComposerModal id={id} commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} onClose={() => setFeedbackComposerOpen(false)} />}
    </>
  );
}

export type { CampaignTransactionController } from '../backer/CampaignActions';
