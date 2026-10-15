import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, keccak256, toHex } from 'viem';
import type { AccountSession } from '../../lib/api/auth';
import { editionsApi } from '../../lib/api/editions';
import type { EditionsEntitlement, EditionsEvidence, EditionsPreview } from '../../lib/api/editions';
import { getErrorMessage } from '../../lib/api/error';
import { useEditionsTransaction } from './useEditionsTransaction';
import { getCampaignUiState } from './ui/campaignState';
import { EditionStatusBadge } from './ui/EditionStatusBadge';
import { EditorialCampaignCard } from './ui/EditorialCampaignCard';
import { EditionProgressChart } from './ui/EditionProgressChart';
import { EditionTimeline, type EditionTimelineEvent } from './ui/EditionTimeline';
import './reward.css';

const stages = ['Đang gây quỹ', 'Đang sản xuất', 'Chờ duyệt PDF', 'PDF đã được duyệt', 'Mở hoàn tiền', 'Đã trả Creator'];
const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString('vi-VN');
function userFacingError(message: string) {
  return message === 'Creator or Resolver required' ? 'Khu vực kiểm tra riêng tư chỉ dành cho Creator hoặc Resolver.' : message;
}
function entitlementPresentation(access: EditionsEntitlement['access']) {
  switch (access) {
    case 'REFUND_ELIGIBLE': return { label: 'Có thể nhận hoàn tiền', tone: 'warning' as const, description: 'Campaign không đạt mục tiêu. Khoản pledge của bạn đang chờ nhận lại.' };
    case 'REFUNDED': return { label: 'Đã hoàn tiền', tone: 'neutral' as const, description: 'Khoản pledge đã được trả lại về ví đã dùng để ủng hộ.' };
    case 'DOWNLOAD_ELIGIBLE': return { label: 'PDF đã sẵn sàng', tone: 'success' as const, description: 'Bạn có thể mở campaign để kiểm tra và tải PDF riêng tư.' };
    case 'PENDING_RELEASE': return { label: 'Đang chờ PDF', tone: 'info' as const, description: 'Pledge đã được ghi nhận; Resolver chưa duyệt bản PDF cuối.' };
    case 'ORPHANED': return { label: 'Không còn hợp lệ', tone: 'danger' as const, description: 'Giao dịch này không còn thuộc deployment canonical hiện tại.' };
  }
}
function EditionsEntitlementCard({ item }: { item: EditionsEntitlement }) {
  const presentation = entitlementPresentation(item.access);
  const uiState = getCampaignUiState({ access: item.access });
  const detailHref = `#/reward/editions/${item.campaignId}`;
  return (
    <article className={`panel edition-entitlement-card edition-entitlement-card--${presentation.tone}`}>
      <div className="edition-entitlement-card__header">
        <div>
          <span className="edition-eyebrow">Khoản hỗ trợ Editions</span>
          <h2>{item.campaignTitle}</h2>
        </div>
        <EditionStatusBadge state={uiState} />
      </div>
      <p className="edition-entitlement-card__amount">{amount(item.amountPaid)}</p>
      <p className="edition-entitlement-card__description">{presentation.description}</p>
      {item.access === 'REFUND_ELIGIBLE' && (
        <div className="edition-next-action edition-next-action--refund">
          <strong>Việc cần làm tiếp theo</strong>
          <p>Nhận hoàn tiền về đúng ví đã pledge.</p>
          <a className="button button--primary" href={detailHref}>Mở campaign để nhận hoàn tiền →</a>
        </div>
      )}
      {item.access === 'REFUNDED' && (
        <p className="edition-complete-state">✓ Đã hoàn tất. Không còn bước nào cần thực hiện.</p>
      )}
      {item.access === 'DOWNLOAD_ELIGIBLE' && (
        <a className="button button--primary edition-entitlement-card__action" href={detailHref}>Mở campaign để tải PDF →</a>
      )}
      {item.access === 'PENDING_RELEASE' && (
        <a className="button button--secondary edition-entitlement-card__action" href={detailHref}>Theo dõi campaign →</a>
      )}
      <details className="edition-entitlement-details">
        <summary>Chi tiết giao dịch</summary>
        <p>
          Campaign: {item.campaignId}<br />
          Ví pledge: {item.backerWallet}<br />
          Transaction: {item.transactionHash}
        </p>
      </details>
    </article>
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EditionsPublicCard({ item }: { item: EditionsPreview }) {
  const uiState = getCampaignUiState({
    status: item.status,
    chainState: item.surface === 'FUNDING' ? 0 : undefined,
  });
  return (
    <EditorialCampaignCard
      campaign={item}
      state={uiState}
      href={`#/reward/editions/${item.id}`}
    />
  );
}

function EditionsPublicSurface({ title, description, items, empty }: { title: string; description: string; items: EditionsPreview[] | undefined; empty: string }) {
  return (
    <section className="editions-public-surface" aria-label={title}>
      <div className="editions-public-surface__heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="editions-public-surface__count">{items?.length ?? 0}</span>
      </div>
      {items?.length ? (
        <div className="editions-shelf-grid">
          {items.map(item => <EditionsPublicCard item={item} key={item.id} />)}
        </div>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  );
}

export function EditionsFeed() {
  const activation = useQuery({ queryKey: ['reward-editions-public', 'activation'], queryFn: ({ signal }) => editionsApi.activation(signal) });
  const funding = useQuery({ queryKey: ['reward-editions-public', 'funding'], queryFn: ({ signal }) => editionsApi.funding(signal) });
  const loading = activation.isPending || funding.isPending;
  const error = activation.error || funding.error;

  return (
    <div className="reward-container">
      <section className="panel edition-hero-banner">
        <h2>Pilot local · MockUSDC</h2>
        <p>Không ứng tiền. Creator chỉ nhận tiền sau PDF được Resolver duyệt, hết 7 ngày challenge và không còn tranh chấp mở. Community góp ý; Resolver ra quyết định.</p>
        <p>Không đạt mục tiêu, hủy trước payout hoặc hết thời hạn theo policy sẽ mở hoàn tiền. Sau payout không có hoàn tiền tự động. Không cam kết lưu trữ vĩnh viễn hay DRM.</p>
      </section>

      {loading && <p role="status">Đang tải trạng thái Editions…</p>}
      {error && <p role="alert">{getErrorMessage(error)}</p>}

      {/* Shelf 1: Đang gây quỹ */}
      <EditionsPublicSurface
        title="Đang gây quỹ"
        description="Campaign đã được indexer xác nhận trên contract; backer có thể pledge theo cam kết."
        items={funding.data}
        empty="Chưa có campaign đang nhận pledge."
      />

      {/* Shelf 2: Community Review Shelf */}
      <section className="editions-feed-review-link" aria-label="Community Review">
        <div>
          <span className="editions-preparation-kicker">Trước khi pledge</span>
          <h2>Community Review</h2>
          <p>Đọc các hồ sơ đang được cộng đồng góp ý. Resolver vẫn là người ra quyết định; pledge chưa mở.</p>
        </div>
        <a className="button button--secondary" href="#/reward/review">Xem Community Review →</a>
      </section>

      {/* Shelf 3: Đã duyệt, chờ kích hoạt */}
      <EditionsPublicSurface
        title="Chờ Creator và Resolver kích hoạt"
        description="Hồ sơ đã được duyệt, nhưng chưa có campaign on-chain canonical để nhận pledge."
        items={activation.data}
        empty="Không có hồ sơ đang chờ kích hoạt."
      />

      <div className="editions-feed-footer-link">
        <a href="#/reward/history">Campaign Reward đã tồn tại</a>
      </div>
    </div>
  );
}

export function EditionsCommunityReviewPage() {
  const review = useQuery({ queryKey: ['reward-editions-public', 'review'], queryFn: ({ signal }) => editionsApi.review(signal) });

  return (
    <div className="reward-container editions-community-review-page">
      <a className="public-back" href="#/reward">← Về trang Editions</a>
      <header className="reward-hero">
        <span className="reward-badge-category">FundTogether Editions · Community</span>
        <h1 className="reward-hero-title">Community Review</h1>
        <p className="reward-hero-pitch">Các hồ sơ đã được Resolver mở để cộng đồng góp ý trước khi có quyết định duyệt. Đây không phải trang pledge và phản hồi không phải phiếu biểu quyết.</p>
      </header>
      {review.isPending && <p role="status">Đang tải hồ sơ community review…</p>}
      {review.error && <p role="alert">{getErrorMessage(review.error)}</p>}
      <EditionsPublicSurface
        title="Community review đang mở"
        description="Hồ sơ đã được Resolver mở cho cộng đồng góp ý; chưa được duyệt và chưa mở pledge."
        items={review.data}
        empty="Chưa có hồ sơ nào đang mở community review."
      />
    </div>
  );
}

export function EditionsCampaign({ id, session, mode = 'public' }: { id: string; session: AccountSession | null; mode?: 'public' | 'creator' | 'resolver' }) {
  const userId = session?.userId;
  const preview = useQuery({ queryKey: ['reward-editions-public', id], queryFn: ({ signal }) => editionsApi.preview(id, signal) });
  const approved = preview.data?.status === 'APPROVED';
  const chain = useQuery({ queryKey: ['reward-editions-chain', id], queryFn: ({ signal }) => editionsApi.chain(id, signal), enabled: approved, refetchInterval: 10000 });
  const publicationTerms = useQuery({ queryKey: ['reward-editions-publication-terms', id, userId], queryFn: () => editionsApi.terms(id),
    enabled: approved && Boolean(userId) && mode !== 'public' && chain.data?.status === 'NOT_PUBLISHED' });
  const privateView = Boolean(userId && mode !== 'public');
  const evidence = useQuery({ queryKey: ['reward-editions-evidence', id, privateView ? userId : 'public'], queryFn: ({ signal }) => editionsApi.evidence(id, privateView, signal), enabled: approved && (privateView || chain.data?.status === 'ON_CHAIN_CONFIRMED') });
  const entitlements = useQuery({ queryKey: ['reward-editions-entitlements', userId], queryFn: ({ signal }) => editionsApi.entitlements(signal), enabled: Boolean(userId) && approved });
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState(''); const [file, setFile] = useState<File | null>(null); const [reason, setReason] = useState('');
  const refresh = () => { void chain.refetch(); void publicationTerms.refetch(); void evidence.refetch(); void entitlements.refetch(); };
  const tx = useEditionsTransaction(refresh);
  const busy = working || tx.busy;
  const state = chain.data?.snapshot;
  const own = entitlements.data?.find(item => item.campaignId === id && item.access !== 'ORPHANED');
  const onchainId = chain.data?.onchainCampaignId;
  const activeId = onchainId == null ? null : BigInt(onchainId);
  const resolverWallet = chain.data?.deployment.resolver;
  const backupWallet = chain.data?.deployment.backupResolver;
  const canReview = mode === 'resolver' && [resolverWallet, backupWallet].some(value => value && value.toLowerCase() === tx.address?.toLowerCase());
  const chainNow = chain.data?.chainTimestamp ? BigInt(chain.data.chainTimestamp) : null;
  const fundingExpired = Boolean(state && chainNow !== null && chainNow >= BigInt(state.fundingDeadline));
  const releasePolicyExpired = Boolean(state && chainNow !== null && state.state !== 3 && chainNow >= BigInt(state.releaseDeadline) + 7n * 24n * 60n * 60n);
  const disputeTimedOut = Boolean(state && chainNow !== null && state.state === 3 && BigInt(state.openDisputes) > 0n && chainNow >= BigInt(state.disputeDeadline));
  const showFinalizeFunding = Boolean(state && mode === 'resolver' && state.state === 0 && fundingExpired);
  const showStartRefunds = Boolean(state && mode === 'resolver' && state.state !== 0 && ![4, 5].includes(state.state) && (releasePolicyExpired || disputeTimedOut));
  const fundingAwaitingFinalization = Boolean(state && state.state === 0 && fundingExpired);
  const pendingProduction = state && !state.productionApproved && state.productionHash !== `0x${'0'.repeat(64)}`;
  const reviewEvidence = evidence.data?.find(item => item.evidenceHash === (state?.state === 2 ? state.releaseEvidenceHash : state?.productionHash));

  async function work(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }
  async function publication() {
    await work(async () => {
      const result = await publicationTerms.refetch();
      if (!result.data) throw new Error('Chưa đọc được cam kết phát hành; hãy tải lại trang.');
      const terms = result.data;
      if (mode !== 'resolver' && !terms.onchainApproved) throw new Error('Primary Resolver chưa ký duyệt cam kết trên chain. Creator chưa thể tạo campaign.');
      const values = [terms.commitmentHash, BigInt(terms.goal), BigInt(terms.price), BigInt(terms.fundingDuration), BigInt(terms.releaseDeadline)];
      await tx.send(mode === 'resolver' ? 'approveCampaign' : 'createCampaign', mode === 'resolver' ? [terms.creatorWallet, ...values] : values,
        { expectedWallet: mode === 'resolver' ? terms.deployment.resolver : terms.creatorWallet });
    });
  }
  async function upload() {
    await work(async () => {
      if (!file || !state) return;
      await editionsApi.upload(id, state.productionApproved ? 'FINAL_PDF' : 'PRODUCTION_EVIDENCE', summary, file);
      setNotice('Đã lưu file riêng tư. Kiểm tra file và hash, rồi gửi yêu cầu thẩm định trên hợp đồng.');
      setFile(null); setSummary(''); await evidence.refetch();
    });
  }
  async function download() {
    await work(async () => {
      if (!own) return;
      const access = await editionsApi.ticket(own.id);
      const blob = await editionsApi.download(access.url);
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = `0x${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
      if (sha256 !== access.sha256) throw new Error('File tải về không khớp hash đã duyệt; báo sự cố cho Resolver.');
      saveBlob(blob, 'edition.pdf'); setNotice('Đã nhận PDF đúng hash. Lượt tải không được xem là bạn đã chấp nhận tác phẩm.');
    });
  }

  if (preview.isPending) return <p role="status">Đang tải cam kết PDF…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;
  const item = preview.data;

  const uiState = getCampaignUiState({
    status: item.status,
    chainState: state?.state,
    role: mode,
  });

  const timelineEvents: EditionTimelineEvent[] = [
    {
      label: 'Chuẩn bị hồ sơ',
      detail: 'Hồ sơ đã khóa và kiểm tra bản quyền',
      tone: 'done',
    },
    {
      label: 'Thẩm định hồ sơ',
      detail: approved ? 'Resolver đã phê duyệt' : 'Đang lấy ý kiến hoặc chờ thẩm định',
      tone: approved ? 'done' : 'current',
    },
    {
      label: 'Gây quỹ on-chain',
      detail: state ? (state.state === 0 ? 'Đang mở gây quỹ trên hợp đồng' : 'Giai đoạn gây quỹ hoàn tất') : 'Chờ kích hoạt campaign trên hợp đồng',
      tone: !state ? 'pending' : (state.state === 0 ? 'current' : 'done'),
    },
    {
      label: 'Sản xuất & Duyệt PDF',
      detail: state ? (state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : state.state >= 1 && state.state <= 3 ? 'Creator đang sản xuất và nộp bằng chứng' : 'Chờ hoàn tất gây quỹ') : 'Chờ sau giai đoạn gây quỹ',
      tone: state?.productionApproved ? 'done' : (state && state.state >= 1 && state.state <= 3 ? 'current' : 'pending'),
    },
  ];
  if (state?.state === 4) {
    timelineEvents.push({
      label: 'Hoàn tiền',
      detail: 'Campaign không đạt mục tiêu · Mở hoàn tiền cho backer',
      tone: 'current',
    });
  }

  return (
    <div className="reward-container edition-campaign-detail">
      <header className="reward-hero">
        <span className="reward-badge-category">FundTogether Editions · COMICS_ARTBOOK</span>
        <h1 className="reward-hero-title">{item.config.title}</h1>
        <p className="reward-hero-pitch">{item.config.pitch}</p>
        <p className="reward-hero-meta">{item.creatorDisplayName} · Standard PDF · {amount(item.config.tiers[0].price)}</p>
      </header>

      {[error, tx.error, chain.error && getErrorMessage(chain.error), publicationTerms.error && getErrorMessage(publicationTerms.error), evidence.error && getErrorMessage(evidence.error), entitlements.error && getErrorMessage(entitlements.error)].filter(Boolean).map((message, index) => <p key={index} role="alert">{userFacingError(String(message))}</p>)}
      {notice && <p role="status">{notice}</p>}
      {tx.notice && <p role="status">{tx.notice}</p>}
      {!userId && <p><a href="#/account">Đăng nhập</a> để góp ý, liên kết ví và ủng hộ bằng MockUSDC local.</p>}

      <div className="campaign-detail-layout">
        {/* Main Column */}
        <div className="campaign-detail-main">
          <section className="panel">
            <h2>Cam kết tác phẩm</h2>
            <p>{item.config.story}</p>
            <p>{item.config.tiers[0].rewardItems[0].description}</p>
            <h3>Đề cương</h3>
            <p>{item.contentOutline}</p>
            <h3>Ngân sách tự sản xuất</h3>
            <p>{item.budgetPlan}</p>
            <h3>Kế hoạch bằng chứng</h3>
            <p>{item.evidencePlan}</p>
            {item.config.tiers[0].estimatedDeliveryAt && <p>Ngày dự kiến phát hành PDF (UTC): {item.config.tiers[0].estimatedDeliveryAt}</p>}
            <p>Hạn cam kết phát hành PDF (UTC): {item.releaseWindow.end}</p>
            <p>Mục tiêu: {amount(item.config.goal)} · {item.config.fundingDuration / 86400} ngày gây quỹ</p>
            <p style={{ overflowWrap: 'anywhere' }}>Cam kết: {item.commitmentHash}</p>
            {item.decisions.map((decision, index) => <p key={index}>Resolver: {decision.outcome} · {decision.reviewedAt}</p>)}
          </section>

          {/* Timeline */}
          <section className="panel">
            <h2>Tiến trình vòng đời</h2>
            <EditionTimeline events={timelineEvents} />
          </section>

          {!approved && (
            <section className="panel">
              <h2>Community review đang mở</h2>
              <p>Community chỉ gửi phản hồi tham khảo; Resolver là người quyết định. Hồ sơ chưa mở pledge.</p>
              <p>Hồ sơ chỉ xuất hiện ở đây sau khi Resolver chủ động mở community review.</p>
            </section>
          )}

          {approved && chain.data && !state && (
            <section className="panel">
              <h2>Chưa phát hành trên hợp đồng Editions</h2>
              <p>Hồ sơ được duyệt và giao dịch phát hành là hai bước riêng. Primary Resolver ký đúng cam kết trước khi Creator tạo campaign.</p>
              {userId && mode !== 'public' && publicationTerms.isPending && <p role="status">Đang kiểm tra chữ ký cam kết trên chain…</p>}
              {userId && mode === 'creator' && publicationTerms.data && !publicationTerms.data.onchainApproved && (
                <>
                  <p role="status">Đang chờ Primary Resolver ký duyệt cam kết trên chain. Creator chưa thể tạo campaign.</p>
                  <button className="button button--secondary" disabled={busy || publicationTerms.isFetching} onClick={() => void publicationTerms.refetch()}>Kiểm tra lại chữ ký</button>
                </>
              )}
              {userId && mode === 'creator' && publicationTerms.data?.onchainApproved && (
                <button className="button button--primary" disabled={busy} onClick={() => void publication()}>Tạo campaign local từ cam kết</button>
              )}
              {userId && mode === 'resolver' && (
                <>
                  {publicationTerms.data?.onchainApproved && <p role="status">Primary Resolver đã ký duyệt cam kết trên chain.</p>}
                  {!publicationTerms.data?.onchainApproved && (
                    <button className="button button--primary" disabled={busy} onClick={() => void publication()}>Ký duyệt cam kết local</button>
                  )}
                </>
              )}
            </section>
          )}

          {state && activeId !== null && state.state !== 4 && (
            <section className="panel">
              <h2>Bằng chứng & bản PDF cuối</h2>
              <p>{state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : 'Bằng chứng sản xuất chưa được duyệt.'} Việc duyệt sản xuất chưa mở quyền tải PDF.</p>
              {mode === 'creator' && userId && state.state === 1 && !pendingProduction && (
                <form onSubmit={event => { event.preventDefault(); void upload(); }}>
                  <label className="field">
                    {state.productionApproved ? 'PDF cuối riêng tư' : 'Bằng chứng sản xuất riêng tư'} · tối đa 10 MiB
                    <input type="file" accept={state.productionApproved ? 'application/pdf' : 'application/pdf,image/png,image/jpeg'} required onChange={event => setFile(event.target.files?.[0] ?? null)} />
                  </label>
                  <label className="field">
                    Tóm tắt công khai, không ghi thông tin riêng tư
                    <textarea required minLength={20} maxLength={5000} value={summary} onChange={event => setSummary(event.target.value)} />
                  </label>
                  <button disabled={busy || !file} className="button button--primary">Lưu file và hash</button>
                </form>
              )}
              {evidence.data?.map(proof => (
                <div key={proof.id} style={{ marginTop: 16 }}>
                  <h3>{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</h3>
                  <p>{proof.summary}</p>
                  <p style={{ overflowWrap: 'anywhere' }}>File: {proof.sha256}<br />Bằng chứng: {proof.evidenceHash}</p>
                  {privateView && (
                    <button disabled={busy} className="button button--secondary" onClick={() => void work(async () => saveBlob(await editionsApi.evidenceFile(id, proof.id), proof.mediaType === 'application/pdf' ? 'review.pdf' : 'evidence.png'))}>Tải file để kiểm tra</button>
                  )}
                  {mode === 'creator' && state.state === 1 && !pendingProduction && ((proof.purpose === 'FINAL_PDF' && state.productionApproved && proof.productionHash === state.productionHash) || (proof.purpose === 'PRODUCTION_EVIDENCE' && !state.productionApproved)) && (
                    <button disabled={busy} className="button button--primary" onClick={() => void tx.send(proof.purpose === 'FINAL_PDF' ? 'submitRelease' : 'submitProduction', proof.purpose === 'FINAL_PDF' ? [activeId, proof.sha256, proof.evidenceHash] : [activeId, proof.evidenceHash], { expectedWallet: state.creator })}>Gửi đúng hash này để Resolver duyệt</button>
                  )}
                </div>
              ))}
              {mode === 'resolver' && <p>Ký bằng ví Primary Resolver hoặc Backup sau 7 ngày chờ. Community chỉ gửi nhận xét; không có quyền duyệt tiền.</p>}
              {canReview && reviewEvidence && (state.state === 2 || pendingProduction) && (
                <div>
                  <p>Kiểm tra file riêng tư và phản hồi community trước khi quyết định.</p>
                  {[true, false].map(accepted => (
                    <button key={String(accepted)} disabled={busy} className="button button--secondary" onClick={() => void tx.send(state.state === 2 ? 'reviewRelease' : 'reviewProduction', state.state === 2 ? [activeId, state.pdfHash, state.releaseEvidenceHash, accepted] : [activeId, state.productionHash, accepted])}>
                      {accepted ? 'Duyệt' : 'Từ chối'} {state.state === 2 ? 'PDF cuối' : 'bằng chứng sản xuất'}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {own && state && state.state !== 4 && (
            <section className="panel">
              <h2>Quyền PDF của bạn</h2>
              <p>{own.access === 'DOWNLOAD_ELIGIBLE' ? 'PDF đã sẵn sàng' : own.access === 'PENDING_RELEASE' ? 'Đang chờ PDF' : own.access === 'ORPHANED' ? 'Không còn hợp lệ' : own.access} · {amount(own.amountPaid)}</p>
              {own.access === 'DOWNLOAD_ELIGIBLE' && (
                <>
                  <button disabled={busy} className="button button--primary" onClick={() => void download()}>Kiểm tra và tải PDF riêng tư</button>
                  <button disabled={busy || Boolean(own.confirmedAt)} className="button button--secondary" onClick={() => void work(async () => { await editionsApi.confirm(own.id); await entitlements.refetch(); })}>
                    {own.confirmedAt ? 'BACKER_CONFIRMED' : 'Tôi đã kiểm tra và xác nhận PDF'}
                  </button>
                </>
              )}
              <p>Lượt tải là nhật ký truy cập. Xác nhận của bạn là phản hồi riêng, không tự giải ngân.</p>
            </section>
          )}

          {userId && state && state.state !== 4 && (state.state === 3 || chain.data!.challenges.length > 0) && (
            <section className="panel">
              <h2>Challenge trước payout</h2>
              <label className="field">Lý do / bằng chứng chi tiết gửi Resolver<textarea minLength={10} maxLength={2500} value={reason} onChange={event => setReason(event.target.value)} /></label>
              {own && state.state === 3 && (
                <button disabled={busy || reason.trim().length < 10} className="button button--secondary" onClick={() => void work(async () => {
                  await editionsApi.comment(id, { targetHash: state.releaseEvidenceHash, kind: 'ISSUE', body: reason });
                  await tx.send('challengeRelease', [activeId, keccak256(toHex(JSON.stringify(['editions-challenge-v1', id, state.releaseEvidenceHash, reason])))], { expectedWallet: own.backerWallet });
                })}>Gửi báo cáo và challenge bằng ví đã pledge</button>
              )}
              {chain.data!.challenges.map(challenge => (
                <div key={challenge.backer}>
                  <p style={{ overflowWrap: 'anywhere' }}>{challenge.backer} · {challenge.resolved ? challenge.upheld ? 'Chấp nhận khiếu nại' : 'Bác khiếu nại' : 'Đang chờ Resolver'}<br />Bằng chứng: {challenge.evidenceHash}</p>
                  {canReview && !challenge.resolved && state.state === 3 && [true, false].map(upheld => (
                    <button disabled={busy || reason.trim().length < 10} key={String(upheld)} className="button button--secondary" onClick={() => void work(async () => {
                      const body = `${upheld ? 'UPHELD' : 'DISMISSED'}: ${reason}`;
                      await editionsApi.comment(id, { targetHash: challenge.evidenceHash, kind: 'COMMENT', body });
                      await tx.send('resolveChallenge', [activeId, challenge.backer, upheld, keccak256(toHex(body))]);
                    })}>
                      {upheld ? 'Chấp nhận: mở hoàn tiền toàn campaign' : 'Bác khiếu nại'}
                    </button>
                  ))}
                </div>
              ))}
              <p>Hết hạn challenge hoặc đã payout: báo sự cố qua phản hồi bên dưới; không có hoàn tiền hợp đồng tự động sau payout.</p>
            </section>
          )}

          {userId && state?.state !== 4 && (
            <EditionsCommunity
              id={id}
              userId={userId}
              viewerMode={mode === 'creator' ? 'creator' : mode === 'resolver' ? 'resolver' : 'community'}
              commitmentHash={item.commitmentHash}
              evidence={evidence.data ?? []}
            />
          )}

          <details className="technical-details">
            <summary>Chi tiết kỹ thuật & hợp đồng</summary>
            <p>
              Commitment Hash: <code className="reward-hash">{item.commitmentHash}</code><br />
              {onchainId && <>ID on-chain: <code>#{onchainId}</code><br /></>}
              Trạng thái UI: <code>{uiState.technicalCode}</code>
            </p>
          </details>
        </div>

        {/* Sticky Aside Column */}
        <aside className="campaign-detail-aside">
          {state && activeId !== null ? (
            <section className={`panel edition-state-panel ${state.state === 4 ? 'edition-state-panel--refund' : ''}`}>
              <div className="edition-state-panel__header">
                <div>
                  <span className="edition-eyebrow">Trạng thái campaign</span>
                  <h2>{fundingAwaitingFinalization ? 'Đã hết hạn gây quỹ · chờ chốt kết quả' : state.state === 4 ? 'Campaign không đạt mục tiêu — đang hoàn tiền' : stages[state.state]}</h2>
                </div>
                <span className="edition-status-badge">{state.state === 4 ? 'REFUNDING' : 'ON_CHAIN_CONFIRMED'}</span>
              </div>

              <div className="campaign-aside-facts">
                <p>Campaign #{onchainId} · Đã pledge {amount(state.raised)} · Escrow {amount(state.escrowed)}</p>
                <p>Hết gây quỹ: {date(state.fundingDeadline)} · Hạn phát hành: {date(state.releaseDeadline)}</p>
              </div>

              {state.state === 0 && (
                <div className="campaign-aside-progress">
                  <EditionProgressChart pledged={state.raised} goal={state.goal} />
                </div>
              )}

              {state.state === 4 ? (
                <div className="edition-next-action edition-next-action--refund">
                  <strong>{own?.access === 'REFUNDED' ? 'Bạn đã nhận hoàn tiền' : own?.access === 'REFUND_ELIGIBLE' ? 'Khoản pledge của bạn đã đủ điều kiện hoàn tiền' : 'Backer tự nhận hoàn tiền'}</strong>
                  <p>{own?.access === 'REFUNDED' ? 'Giao dịch hoàn tiền đã được ghi nhận. Bạn không cần thực hiện thêm bước nào.' : own?.access === 'REFUND_ELIGIBLE' ? 'Tiền sẽ trở về đúng ví đã dùng để pledge.' : 'Resolver đã mở trạng thái hoàn tiền. Mỗi backer tự claim khoản của mình; Creator không nhận khoản này.'}</p>
                  {userId && own?.access === 'REFUND_ELIGIBLE' && (
                    <button disabled={busy} className="button button--primary" onClick={() => void tx.send('claimRefund', [activeId], { expectedWallet: own.backerWallet })}>Nhận hoàn tiền vào ví đã pledge</button>
                  )}
                </div>
              ) : (
                <>
                  {fundingAwaitingFinalization && <p role="status">Deadline đã qua nhưng contract chỉ chuyển sang hoàn tiền sau khi có giao dịch chốt kết quả. Resolver cần kết nối đúng ví Primary hoặc Backup để thực hiện bước này.</p>}
                  {state.state === 3 && <p>Challenge đến {date(state.challengeDeadline)} · {state.openDisputes} tranh chấp mở. Payout chỉ sau hạn và không còn tranh chấp.</p>}
                  {userId && (
                    <div className="edition-action-row">
                      {fundingAwaitingFinalization && mode === 'resolver' && !canReview && <p role="alert">Chưa thấy ví Resolver hợp lệ. Hãy chuyển MetaMask sang ví Primary hoặc Backup Resolver rồi refresh trang.</p>}
                      {state.state === 0 && !own && (
                        <button disabled={busy} className="button button--primary" onClick={() => void tx.send('pledge', [activeId], { pledgePrice: state.price })}>Ủng hộ {amount(state.price)} · một PDF</button>
                      )}
                      {showFinalizeFunding && (
                        <button disabled={busy || !canReview} className="button button--secondary" onClick={() => void tx.send('finalizeFunding', [activeId])}>Chốt kết quả khi hết hạn gây quỹ</button>
                      )}
                      {state.state === 3 && (
                        <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('payout', [activeId])}>Trả Creator khi đủ điều kiện</button>
                      )}
                      {showStartRefunds && (
                        <button disabled={busy || !canReview} className="button button--secondary" onClick={() => void tx.send('startRefunds', [activeId])}>Mở hoàn tiền khi quá hạn policy</button>
                      )}
                      {mode === 'creator' && ![4, 5].includes(state.state) && (
                        <button disabled={busy} className="button button--secondary" onClick={() => void tx.send('cancelCampaign', [activeId], { expectedWallet: state.creator })}>Hủy campaign và mở hoàn tiền toàn bộ</button>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="panel campaign-aside-summary">
              <span className="edition-eyebrow">Tóm tắt campaign</span>
              <h2>{item.config.title}</h2>
              <p>Mục tiêu: {amount(item.config.goal)}</p>
              <p>Giá 1 PDF: {amount(item.config.tiers[0].price)}</p>
              <EditionStatusBadge state={uiState} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export function EditionsCommunity({ id, userId, viewerMode = 'community', commitmentHash, evidence = [] }: { id: string; userId: string; viewerMode?: 'community' | 'creator' | 'resolver'; commitmentHash: string; evidence?: EditionsEvidence[] }) {
  const query = useQuery({ queryKey: ['reward-editions-feedback', id, userId], queryFn: ({ signal }) => editionsApi.feedback(id, signal) });
  const [body, setBody] = useState(''); const [kind, setKind] = useState<'COMMENT' | 'ISSUE'>('COMMENT'); const [target, setTarget] = useState(commitmentHash);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  return (
    <section className="panel">
      <h2>Community kiểm tra cùng Resolver</h2>
      <p>Nội dung gửi tới Creator và Resolver; thành viên khác chỉ thấy số lượng phản hồi. Phản hồi không là phiếu biểu quyết và không tự khóa hay chuyển tiền.</p>
      {viewerMode === 'creator' ? (
        <p className="muted">Creator chỉ đọc phản hồi; không thể gửi phản hồi từ chính campaign này.</p>
      ) : (
        <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); void editionsApi.comment(id, { targetHash: target, kind, body }).then(async () => { setBody(''); await query.refetch(); }).catch(err => setError(getErrorMessage(err))).finally(() => setBusy(false)); }}>
          <label className="field">
            Nội dung đang kiểm tra
            <select value={target} onChange={event => setTarget(event.target.value)}>
              <option value={commitmentHash}>Cam kết campaign</option>
              {evidence.map(item => <option key={item.id} value={item.evidenceHash}>{item.purpose} · {item.evidenceHash.slice(0, 12)}</option>)}
            </select>
          </label>
          <label className="field">
            Loại phản hồi
            <select value={kind} onChange={event => setKind(event.target.value as 'COMMENT' | 'ISSUE')}>
              <option value="COMMENT">Nhận xét</option>
              <option value="ISSUE">Báo sự cố</option>
            </select>
          </label>
          <label className="field">
            Chi tiết cần kiểm tra
            <textarea required minLength={10} maxLength={3000} value={body} onChange={event => setBody(event.target.value)} />
          </label>
          <button disabled={busy} className="button button--primary">Gửi phản hồi có tài khoản</button>
        </form>
      )}
      {(error || query.error) && <p role="alert">{error || getErrorMessage(query.error)}</p>}
      {query.data?.map(item => (
        <div key={item.id}>
          <p>{item.kind} · {item.createdAt} · tài khoản {item.authorUserId}</p>
          <p>{item.body}</p>
          <p style={{ overflowWrap: 'anywhere' }}>Đối tượng: {item.targetHash}</p>
        </div>
      ))}
    </section>
  );
}

export function EditionsLibrary({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: ['reward-editions-entitlements', userId], queryFn: ({ signal }) => editionsApi.entitlements(signal) });

  return (
    <section className="reward-container editions-library-page">
      <header className="edition-page-heading">
        <div>
          <span className="edition-eyebrow">Backer</span>
          <h1>Phần thưởng của tôi</h1>
          <p>Theo dõi khoản hỗ trợ, hoàn tiền và quyền tải PDF của bạn.</p>
        </div>
      </header>
      {query.isPending && <p role="status">Đang kiểm tra quyền canonical…</p>}
      {query.error && <p role="alert">{userFacingError(getErrorMessage(query.error))}</p>}
      {query.data?.length === 0 && (
        <div className="edition-empty-state">
          <strong>Chưa có khoản hỗ trợ nào</strong>
          <p>Campaign bạn pledge sẽ xuất hiện ở đây sau khi giao dịch được indexer xác nhận.</p>
          <a className="button button--secondary" href="#/reward">Khám phá Editions →</a>
        </div>
      )}
      <div className="editions-library-shelf">
        {query.data?.map(item => <EditionsEntitlementCard item={item} key={item.id} />)}
      </div>
      <a className="edition-secondary-link" href="#/reward/history/my-rewards">Xem quyền lợi Reward lịch sử →</a>
    </section>
  );
}
