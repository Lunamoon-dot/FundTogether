import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, keccak256, toHex } from 'viem';
import type { AccountSession } from '../../../lib/api/auth';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { useTransaction } from '../transactions/useTransaction';
import { getCampaignUiState } from '../shared/ui/campaignState';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { fundingProgressPercent } from '../shared/ui/fundingProgress';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { ActivationPanel } from '../shared/ui/ActivationPanel';
import { PledgePreflight } from '../shared/ui/PledgePreflight';
import { ReviewThread } from '../shared/ui/ReviewThread';
import { ColophonRubric } from '../shared/ui/ColophonRubric';
import { CommunityPanel, FeedbackComposerModal } from './Community';
import { CompletionSettlementPanel } from '../shared/ui/CompletionSettlementPanel';
import { DisbursementPanel } from '../shared/ui/DisbursementPanel';
import '../shared/styles.css';
const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
const zeroHash = `0x${'0'.repeat(64)}`;
const date = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString('vi-VN');
function userFacingError(message: string) {
  if (message === 'Creator or Resolver required') {
    return 'Khu vực kiểm tra riêng tư chỉ dành cho Creator hoặc Resolver.';
  }
  if (message.includes('Creator and frozen payout wallet must remain verified')) {
    return 'Hồ sơ tác giả (Creator) và ví nhận tiền cần duy trì trạng thái đã xác minh (VERIFIED) để kích hoạt chiến dịch.';
  }
  return message;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type CampaignTab = 'overview' | 'production' | 'commitments' | 'activity';

export function CampaignPage({ id, session, mode = 'public', initialTab = 'overview' }: {
  id: string;
  session: AccountSession | null;
  mode?: 'public' | 'creator' | 'resolver';
  initialTab?: CampaignTab;
}) {
  const userId = session?.userId;
  const preview = useQuery({ queryKey: ['campaign-campaign-public', id], queryFn: ({ signal }) => campaignApi.preview(id, signal) });
  const approved = preview.data?.status === 'APPROVED';
  const campaignApproved = approved || preview.data?.status === 'PUBLISHED';
  const communityReview = preview.data?.status === 'COMMUNITY_REVIEW';
  const chain = useQuery({ queryKey: ['campaign-campaign-chain', id], queryFn: ({ signal }) => campaignApi.chain(id, signal), enabled: campaignApproved, refetchInterval: 10000 });
  const publicationTerms = useQuery({ queryKey: ['campaign-campaign-publication-terms', id, userId, mode], queryFn: () => campaignApi.terms(id),
    enabled: campaignApproved && Boolean(userId) && mode !== 'public' && (chain.data?.status === 'NOT_PUBLISHED' || chain.data?.status === 'ORPHANED') });
  const privateView = Boolean(userId && mode !== 'public');
  const evidence = useQuery({ queryKey: ['campaign-campaign-evidence', id, privateView ? userId : 'public'], queryFn: ({ signal }) => campaignApi.evidence(id, privateView, signal), enabled: campaignApproved && (privateView || chain.data?.status === 'ON_CHAIN_CONFIRMED') });
  const entitlements = useQuery({ queryKey: ['campaign-campaign-entitlements', userId], queryFn: ({ signal }) => campaignApi.entitlements(signal), enabled: Boolean(userId) && campaignApproved });
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [working, setWorking] = useState(false);
  const [summary, setSummary] = useState(''); const [file, setFile] = useState<File | null>(null); const [reason, setReason] = useState('');
  const [completionDeadline, setCompletionDeadline] = useState('');
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialTab);
  const [feedbackComposerOpen, setFeedbackComposerOpen] = useState(false);
  const refresh = () => { void chain.refetch(); if (mode !== 'public' && chain.data?.status !== 'ON_CHAIN_CONFIRMED') void publicationTerms.refetch(); void evidence.refetch(); void entitlements.refetch(); };
  const tx = useTransaction(refresh, { userId, campaignId: id });
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
  const productionPolicyExpired = Boolean(state && chainNow !== null && state.state === 1 && (!state.productionApproved || BigInt(state.releaseDeadline) === 0n) && chainNow >= BigInt(state.fundingDeadline) + 30n * 24n * 60n * 60n);
  const releasePolicyExpired = Boolean(state && chainNow !== null && BigInt(state.releaseDeadline) > 0n && state.state !== 3 && chainNow >= BigInt(state.releaseDeadline) + 7n * 24n * 60n * 60n);
  const disputeTimedOut = Boolean(state && chainNow !== null && state.state === 3 && BigInt(state.openDisputes) > 0n && chainNow >= BigInt(state.disputeDeadline));
  const showFinalizeFunding = Boolean(state && mode === 'resolver' && state.state === 0 && fundingExpired);
  const showStartRefunds = Boolean(state && mode === 'resolver' && state.state !== 0 && ![4, 5, 6].includes(state.state) && (productionPolicyExpired || releasePolicyExpired || disputeTimedOut));
  const postFundingState = Boolean(chain.data?.status === 'ON_CHAIN_CONFIRMED' && state && [1, 2, 3, 5, 6].includes(state.state));
  const fundedParticipant = Boolean(own && !['ORPHANED', 'REFUNDED'].includes(own.access));
  const showPostFundingReview = Boolean(userId && postFundingState && (mode === 'creator' || mode === 'resolver' || fundedParticipant));
  const postFundingTarget = state && state.productionHash !== zeroHash ? state.productionHash : (preview.data?.commitmentHash ?? '');
  const fundingAwaitingFinalization = Boolean(state && state.state === 0 && fundingExpired);
  const pendingProduction = state && !state.productionApproved && state.productionHash !== `0x${'0'.repeat(64)}`;
  const reviewEvidence = evidence.data?.find(item => item.evidenceHash === (state?.state === 2 ? state.releaseEvidenceHash : state?.productionHash));
  const showPublicationTermsError = Boolean(mode !== 'public' && publicationTerms.error && chain.data?.status !== 'ON_CHAIN_CONFIRMED');

  async function work(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }
  async function publication() {
    await work(async () => {
      const result = await publicationTerms.refetch();
      if (!result.data) throw new Error('Chưa đọc được cam kết phát hành; hãy tải lại trang.');
      const terms = result.data;
      if (mode !== 'resolver' && !terms.onchainApproved) throw new Error('Primary Resolver chưa ký duyệt cam kết trên chain. Hãy chọn Kiểm tra lại chữ ký trước khi tạo campaign.');
      const values = [terms.commitmentHash, BigInt(terms.goal), BigInt(terms.price), BigInt(terms.fundingDuration)];
      await tx.send(mode === 'resolver' ? 'approveCampaign' : 'createCampaign', mode === 'resolver' ? [terms.creatorWallet, ...values] : values,
        { expectedWallet: mode === 'resolver' ? terms.deployment.resolver : terms.creatorWallet });
    });
  }
  async function upload() {
    await work(async () => {
      if (!file || !state) return;
      await campaignApi.upload(id, state.productionApproved ? 'FINAL_PDF' : 'PRODUCTION_EVIDENCE', summary, file);
      setNotice('Đã lưu file riêng tư. Kiểm tra file và hash, rồi gửi yêu cầu thẩm định trên hợp đồng.');
      setFile(null); setSummary(''); await evidence.refetch();
    });
  }
  async function download() {
    await work(async () => {
      if (!own) return;
      const access = await campaignApi.ticket(own.id);
      const blob = await campaignApi.download(access.url);
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = `0x${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
      if (sha256 !== access.sha256) throw new Error('File tải về không khớp hash đã duyệt; báo sự cố cho Resolver.');
      saveBlob(blob, 'campaign.pdf'); setNotice('Đã nhận PDF đúng hash. Lượt tải không được xem là bạn đã chấp nhận tác phẩm.');
    });
  }

  if (preview.isPending) return <p role="status">Đang tải cam kết PDF…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;
  const item = preview.data;

  const uiState = getCampaignUiState({
    status: item.status,
    chainState: state?.state,
    publicationStatus: item.surface === 'ORPHANED' ? 'ORPHANED' : chain.data?.status ?? null,
    role: mode,
  });

  const timelineEvents: TimelineEvent[] = [
    {
      label: 'Chuẩn bị hồ sơ',
      detail: 'Hồ sơ đã khóa và kiểm tra bản quyền',
      tone: 'done',
    },
    {
      label: 'Thẩm định hồ sơ',
      detail: campaignApproved ? 'Resolver đã phê duyệt' : 'Đang lấy ý kiến hoặc chờ thẩm định',
      tone: campaignApproved ? 'done' : 'current',
    },
    {
      label: 'Gây quỹ on-chain',
      detail: state
        ? state.state === 0
          ? 'Đang mở gây quỹ trên hợp đồng'
          : state.state === 4
            ? 'Không đạt mục tiêu · Contract đã chuyển sang hoàn tiền'
            : 'Giai đoạn gây quỹ hoàn tất'
        : 'Chờ kích hoạt campaign trên hợp đồng',
      tone: !state ? 'pending' : (state.state === 0 ? 'current' : 'done'),
    },
  ];
  if (state?.state === 4) {
    timelineEvents.push({
      label: 'Hoàn tiền',
      detail: 'Campaign không đạt mục tiêu · Backer tự nhận hoàn tiền',
      tone: 'current',
    });
  } else {
    timelineEvents.push({
      label: 'Sản xuất & Duyệt PDF',
      detail: state ? (state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : state.state >= 1 && state.state <= 3 ? 'Creator đang sản xuất và nộp bằng chứng' : 'Chờ sau giai đoạn gây quỹ') : 'Chờ sau giai đoạn gây quỹ',
      tone: state?.productionApproved ? 'done' : (state && state.state >= 1 && state.state <= 3 ? 'current' : 'pending'),
    });
  }

  const percent = state ? fundingProgressPercent(state.raised, state.goal) : 0;
  const formatDate = (isoOrSeconds?: string) => {
    if (!isoOrSeconds) return 'Chưa xác định';
    try {
      const d = /^\d+$/.test(isoOrSeconds) ? new Date(Number(isoOrSeconds) * 1000) : new Date(isoOrSeconds);
      if (isNaN(d.getTime())) return isoOrSeconds;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoOrSeconds;
    }
  };

  return (
    <>
    <div className="campaign-container monograph-container">
      {/* 1. Breadcrumbs */}
      <div className="monograph-nav">
        <div className="flex items-center gap-1.5">
          <a href="#/campaigns">← The Salon</a>
          <span>/</span>
          <span className="truncate max-w-[140px] font-mono">{id}</span>
          <span>/</span>
          <span className="font-semibold text-neutral-800">The Monograph</span>
        </div>
        <div className="text-xs uppercase text-neutral-500 font-mono">
          CAMPAIGN · COMICS &amp; ARTBOOKS
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="monograph-tabs" role="tablist">
        {(['overview', 'production', 'commitments', 'activity'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`monograph-tab-btn ${activeTab === tab ? 'monograph-tab-btn--active' : ''}`}
          >
            {tab === 'overview' ? 'Tổng quan (Folio)' : tab === 'production' ? 'Sản xuất & Bằng chứng' : tab === 'commitments' ? 'Cam kết & Tiến trình' : 'Góp ý & Thẩm định'}
          </button>
        ))}
      </div>

      {/* 4. Alert / Notices */}
      {[error, tx.error, chain.error && getErrorMessage(chain.error), showPublicationTermsError && getErrorMessage(publicationTerms.error), evidence.error && getErrorMessage(evidence.error), entitlements.error && getErrorMessage(entitlements.error)].filter(Boolean).map((message, index) => (
        <div key={index} role="alert" className="monograph-alert monograph-alert--error mt-4">
          {userFacingError(String(message))}
        </div>
      ))}
      {notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{notice}</div>}
      {tx.notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{tx.notice}</div>}
      {!userId && (
        <div className="monograph-alert monograph-alert--info mt-4">
          <a href="#/account" className="underline font-semibold">Đăng nhập</a> để góp ý, liên kết ví và ủng hộ bằng MockUSDC local.
        </div>
      )}

      {/* Refunding Banner */}
      {state?.state === 4 && (
        <div className="monograph-alert monograph-alert--warning mt-6 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true">⚠</span>
            <span>Campaign không đạt mục tiêu — đang hoàn tiền</span>
          </div>
          <p className="text-sm m-0">
            Chiến dịch đang trong trạng thái hoàn tiền. Backer tự thực hiện claim refund.
          </p>
        </div>
      )}

      {/* 5. Main 2-Column Split-Volume Layout */}
      <div className="monograph-split-layout mt-6">
        {/* Left Column (The Auteur Folio) */}
        <div className="monograph-folio">
          {/* Compact Campaign Edition Header */}
          <div className="monograph-hero monograph-hero--compact">
            <div className="monograph-hero__content">
              <div className="monograph-hero__kicker">
                <span>ẤN BẢN ĐỘC QUYỀN</span>
                <span>·</span>
                <span>STANDARD PDF TIER</span>
              </div>
              <h1 className="monograph-hero__title">
                {item.config.title || 'Standard PDF'}
              </h1>
              <p className="monograph-hero__author">
                Auteur / Tác giả: <strong>{item.creatorDisplayName}</strong>
              </p>
              <div className="monograph-hero__pills">
                <StatusBadge state={uiState} />
                {campaignApproved && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#f0f4ee] text-[#2b5936] border border-[#d2e3d5]">
                    ✓ Resolver Verified
                  </span>
                )}
                {state?.state === 4 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-[#faeceb] text-[#9e2a2b] border border-[#e8c4c3]">
                    ⚠ Đang hoàn tiền tự động
                  </span>
                )}
              </div>
            </div>

            <div className="monograph-hero__rubric">
              <ColophonRubric
                compact={true}
                commitmentHash={item.commitmentHash}
                collateralPercent={percent}
                pledgedFormatted={state ? amount(state.raised) : undefined}
                goalFormatted={amount(item.config.goal)}
                resolverVerified={campaignApproved}
                stateLabel={uiState.label}
                creatorName={item.creatorDisplayName}
              />
            </div>
          </div>
          {activeTab === 'overview' && (
            <>
              {/* Thông tin ấn phẩm & Tier */}
              <div className="monograph-card">
                <span className="monograph-card__kicker">ẤN PHẨM &amp; PHẦN THƯỞNG TIÊU CHUẨN</span>
                <h2 className="monograph-card__title">Thông tin ấn phẩm</h2>
                <p className="monograph-card__pitch">
                  {item.config.tiers[0]?.benefitItems[0]?.description || item.config.pitch || 'Một file PDF hoàn chỉnh của truyện tranh hoặc artbook.'}
                </p>

                <div className="monograph-tier-spec">
                  <div className="monograph-tier-spec__header">
                    <span className="monograph-tier-spec__badge">STANDARD DIGITAL CAMPAIGN</span>
                    <span className="monograph-tier-spec__price">{amount(item.config.tiers[0].price)}</span>
                  </div>
                  <div className="monograph-tier-spec__details">
                    <div className="monograph-tier-spec__item">
                      <svg className="monograph-tier-spec__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                      <div>
                        <strong>Gói phần thưởng:</strong> {item.config.tiers[0]?.title || 'Standard Digital Campaign'} (Ấn bản độc quyền dành cho backer)
                      </div>
                    </div>
                    <div className="monograph-tier-spec__item">
                      <svg className="monograph-tier-spec__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      <div>
                        <strong>Cơ chế phân phối:</strong> Tải xuống tệp PDF hoàn chỉnh qua vé xác thực ngắn hạn sau khi Resolver duyệt phát hành.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {chain.data && state && (
                <DisbursementPanel
                  campaignId={id}
                  userId={userId}
                  mode={mode}
                  chain={chain.data}
                  transaction={tx}
                  onRefresh={refresh}
                />
              )}

              {/* Production documents */}
              <div className="monograph-card">
                <span className="monograph-card__kicker">HỒ SƠ THẨM ĐỊNH (EDITORIAL DOSSIER)</span>
                <h2 className="monograph-card__title">Tài liệu sản xuất &amp; Kế hoạch cam kết</h2>
                <p className="monograph-card__desc">
                  Các tài liệu minh chứng do auteur cam kết và được Resolver thẩm định kỹ lưỡng trước khi mở gây quỹ.
                </p>

                <div className="monograph-dossier-stack">
                  <details className="monograph-dossier">
                    <summary className="monograph-dossier__summary">
                      <div className="monograph-dossier__left">
                        <span className="monograph-dossier__tag">01</span>
                        <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <line x1="9" y1="9" x2="15" y2="9" />
                          <line x1="9" y1="13" x2="15" y2="13" />
                          <line x1="9" y1="17" x2="13" y2="17" />
                        </svg>
                        <span className="monograph-dossier__label">Đề cương nội dung</span>
                      </div>
                      <span className="monograph-dossier__chevron" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                      </span>
                    </summary>
                    <div className="monograph-dossier__content">
                      {item.contentOutline || <span className="italic text-[var(--ink-subtle)]">Chưa có đề cương nội dung chi tiết.</span>}
                    </div>
                  </details>

                  <details className="monograph-dossier">
                    <summary className="monograph-dossier__summary">
                      <div className="monograph-dossier__left">
                        <span className="monograph-dossier__tag">02</span>
                        <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="12" y1="1" x2="12" y2="23"></line>
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <span className="monograph-dossier__label">Kế hoạch ngân sách</span>
                      </div>
                      <span className="monograph-dossier__chevron" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                      </span>
                    </summary>
                    <div className="monograph-dossier__content">
                      {item.budgetPlan || <span className="italic text-[var(--ink-subtle)]">Chưa có kế hoạch ngân sách chi tiết.</span>}
                    </div>
                  </details>

                  <details className="monograph-dossier">
                    <summary className="monograph-dossier__summary">
                      <div className="monograph-dossier__left">
                        <span className="monograph-dossier__tag">03</span>
                        <svg className="monograph-dossier__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        <span className="monograph-dossier__label">Kế hoạch bằng chứng</span>
                      </div>
                      <span className="monograph-dossier__chevron" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                      </span>
                    </summary>
                    <div className="monograph-dossier__content">
                      {item.evidencePlan || <span className="italic text-[var(--ink-subtle)]">Chưa có kế hoạch bằng chứng sản xuất.</span>}
                    </div>
                  </details>
                </div>
              </div>

              {/* Backer entitlement card when owned and not refunded */}
              {own && state && state.state !== 4 && (
                <div className="monograph-card space-y-3">
                  <span className="monograph-card__kicker">QUYỀN LỢI ĐÃ MỞ (BACKER ENTITLEMENT)</span>
                  <h2 className="monograph-card__title">Quyền PDF của bạn</h2>
                  <p className="monograph-card__pitch">
                    {own.access === 'DOWNLOAD_ELIGIBLE' ? 'PDF đã sẵn sàng' : own.access === 'DELIVERY_UNAVAILABLE' ? 'PDF cần Resolver kiểm tra' : own.access === 'PENDING_RELEASE' ? 'Đang chờ PDF' : own.access === 'ORPHANED' ? 'Không còn hợp lệ' : own.access} · <strong>{amount(own.amountPaid)}</strong>
                  </p>
                  {own.access === 'DOWNLOAD_ELIGIBLE' && (
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button disabled={busy} className="button button--primary" onClick={() => void download()}>
                        Kiểm tra và tải PDF riêng tư
                      </button>
                      <button disabled={busy || Boolean(own.confirmedAt)} className="button button--secondary" onClick={() => void work(async () => { await campaignApi.confirm(own.id); await entitlements.refetch(); })}>
                        {own.confirmedAt ? 'BACKER_CONFIRMED' : 'Tôi đã kiểm tra và xác nhận PDF'}
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-[var(--ink-subtle)] m-0">
                    Lượt tải là nhật ký truy cập. Xác nhận của bạn là phản hồi riêng, không tự giải ngân.
                  </p>
                </div>
              )}

              {/* Verified evidence status label */}
              {state && state.productionApproved && (
                <div className="rounded-lg border border-[var(--border-hairline)] p-3.5 bg-[#f0fdf4] text-xs text-[#166534] font-medium flex items-center gap-2">
                  <span aria-hidden="true">✓</span>
                  <span>EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.</span>
                </div>
              )}

              {/* Community Review Notice if not approved */}
              {communityReview && (
                <div className="monograph-card space-y-2">
                  <span className="monograph-card__kicker">GIAI ĐOẠN ĐÁNH GIÁ</span>
                  <h2 className="monograph-card__title">Community review đang mở</h2>
                  <p className="monograph-card__pitch">Community chỉ gửi phản hồi tham khảo; Resolver là người quyết định. Hồ sơ chưa mở pledge.</p>
                  <p className="text-xs text-[var(--ink-subtle)] m-0">Hồ sơ chỉ xuất hiện ở đây sau khi Resolver chủ động mở community review.</p>
                  {userId && mode !== 'creator' && (
                    <button type="button" className="button button--primary mt-2" onClick={() => setFeedbackComposerOpen(true)}>
                      Gửi góp ý
                    </button>
                  )}
                </div>
              )}

              {campaignApproved && chain.data && mode !== 'public' && (
                <ActivationPanel
                  mode={mode}
                  terms={publicationTerms.data}
                  chain={chain.data}
                  transaction={tx.transaction?.action === 'approveCampaign' || tx.transaction?.action === 'createCampaign' ? tx.transaction : null}
                  busy={busy || publicationTerms.isFetching}
                  onRefresh={() => { void chain.refetch(); void publicationTerms.refetch(); }}
                  onActivate={() => void publication()}
                  onReconcile={() => {
                    if (tx.transaction?.txHash) void tx.reconcile();
                    else if (chain.data?.bindingTransactionHash) void tx.reconcile('createCampaign', chain.data.bindingTransactionHash);
                    else void chain.refetch();
                  }}
                />
              )}
            </>
          )}

          {/* Production Tab */}
          {activeTab === 'production' && (
            <div className="space-y-6">
              {state && activeId !== null && state.state !== 4 && (
                <div className="monograph-card space-y-4">
                  <span className="monograph-card__kicker">QUY TRÌNH SẢN XUẤT</span>
                  <h2 className="monograph-card__title">Bằng chứng &amp; bản PDF cuối</h2>
                  <p className="monograph-card__pitch">
                    {state.productionApproved ? 'EVIDENCE_REVIEWED · Bằng chứng sản xuất đã được duyệt.' : 'Bằng chứng sản xuất chưa được duyệt.'} Đây là hồ sơ của bước sản xuất sau khi campaign hoạt động, không phải điều kiện để gửi yêu cầu giải ngân lần đầu. Việc duyệt sản xuất chưa mở quyền tải PDF.
                  </p>
                  {mode === 'creator' && userId && state.state === 1 && state.productionApproved && BigInt(state.releaseDeadline) === 0n && (
                    <div className="rounded border border-[var(--border-hairline)] bg-[var(--paper-bone)] p-3 space-y-2">
                      <p className="text-sm font-semibold text-[var(--ink-carbon)] m-0">Creator xác nhận hoàn thành campaign</p>
                      <p className="text-xs text-[var(--ink-subtle)] m-0">Resolver đã duyệt bằng chứng sản xuất. Chỉ Creator mới chốt hạn cam kết phát hành PDF ở bước này.</p>
                      <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">
                        Hạn cam kết phát hành PDF (UTC)
                        <input type="date" value={completionDeadline} min={new Date().toISOString().slice(0, 10)} onChange={event => setCompletionDeadline(event.target.value)} className="mt-1 block rounded border border-[var(--border-hairline)] bg-white p-2 text-sm normal-case tracking-normal" />
                      </label>
                      <button type="button" disabled={busy || !completionDeadline} className="button button--primary" onClick={() => void work(async () => {
                        if (activeId === null) return;
                        const deadline = BigInt(Math.floor(new Date(`${completionDeadline}T23:59:59Z`).getTime() / 1000));
                        await tx.send('confirmCampaignCompletion', [activeId, deadline], { expectedWallet: state.creator });
                      })}>
                        Xác nhận hoàn thành campaign
                      </button>
                    </div>
                  )}
                  {mode === 'creator' && userId && state.state === 1 && !pendingProduction && (!state.productionApproved || BigInt(state.releaseDeadline) > 0n) && (
                    <form onSubmit={event => { event.preventDefault(); void upload(); }} className="space-y-3 pt-2">
                      <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">
                        {state.productionApproved ? 'PDF cuối riêng tư' : 'Bằng chứng sản xuất riêng tư'} · tối đa 10 MiB
                        <input type="file" accept={state.productionApproved ? 'application/pdf' : 'application/pdf,image/png,image/jpeg'} required onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-[var(--ink-lead)] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-[var(--border-hairline)] file:text-xs file:font-medium file:bg-[var(--paper-bone)] file:text-[var(--ink-carbon)]" />
                      </label>
                      <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">
                        Tóm tắt công khai, không ghi thông tin riêng tư
                        <textarea required minLength={20} maxLength={5000} value={summary} onChange={event => setSummary(event.target.value)} className="mt-1 block w-full rounded border border-[var(--border-hairline)] bg-white p-2.5 text-sm text-[var(--ink-carbon)] focus:outline-none focus:border-[var(--seal-vermilion)]" />
                      </label>
                      <button disabled={busy || !file} className="button button--primary">Lưu file và hash</button>
                    </form>
                  )}
                  {evidence.data?.map(proof => (
                    <div key={proof.id} className="border-t border-[var(--border-hairline)] pt-3.5 space-y-1.5">
                      <h3 className="text-sm font-semibold text-[var(--ink-carbon)] m-0">{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</h3>
                      <p className="text-sm text-[var(--ink-lead)] m-0">{proof.summary}</p>
                      <p className="text-xs font-mono text-[var(--ink-subtle)] m-0 break-all bg-[var(--paper-bone)] p-2 rounded border border-[var(--border-hairline-subtle)]">File: {proof.sha256}<br />Bằng chứng: {proof.evidenceHash}</p>
                      {privateView && (
                        <button disabled={busy} className="button button--secondary" onClick={() => void work(async () => saveBlob(await campaignApi.evidenceFile(id, proof.id), proof.mediaType === 'application/pdf' ? 'review.pdf' : 'evidence.png'))}>Tải file để kiểm tra</button>
                      )}
                      {mode === 'creator' && state.state === 1 && !pendingProduction && ((proof.purpose === 'FINAL_PDF' && state.productionApproved && proof.productionHash === state.productionHash) || (proof.purpose === 'PRODUCTION_EVIDENCE' && !state.productionApproved)) && (
                        <button disabled={busy} className="button button--primary" onClick={() => void tx.send(proof.purpose === 'FINAL_PDF' ? 'submitRelease' : 'submitProduction', proof.purpose === 'FINAL_PDF' ? [activeId, proof.sha256, proof.evidenceHash] : [activeId, proof.evidenceHash], { expectedWallet: state.creator })}>Gửi đúng hash này để Resolver duyệt</button>
                      )}
                    </div>
                  ))}
                  {mode === 'resolver' && <p className="text-xs text-[var(--ink-subtle)] m-0">Ký bằng ví Primary Resolver hoặc Backup sau 7 ngày chờ. Community chỉ gửi nhận xét; không có quyền duyệt tiền.</p>}
                  {canReview && reviewEvidence && (state.state === 2 || pendingProduction) && (
                    <div className="space-y-2 pt-3 border-t border-[var(--border-hairline)]">
                      <p className="text-xs text-[var(--ink-lead)] m-0">Kiểm tra file riêng tư và phản hồi community trước khi quyết định.</p>
                      <div className="flex gap-2">
                        {[true, false].map(accepted => (
                          <button key={String(accepted)} disabled={busy} className="button button--secondary" onClick={() => {
                            void tx.send(state.state === 2 ? 'reviewRelease' : 'reviewProduction', state.state === 2 ? [activeId, state.pdfHash, state.releaseEvidenceHash, accepted] : [activeId, state.productionHash, accepted]);
                          }}>
                            {accepted ? 'Duyệt' : 'Từ chối'} {state.state === 2 ? 'PDF cuối' : 'bằng chứng sản xuất'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Commitments Tab */}
          {activeTab === 'commitments' && (
            <div className="space-y-6">
              <div className="monograph-card space-y-4">
                <span className="monograph-card__kicker">VÒNG ĐỜI DỰ ÁN</span>
                <h2 className="monograph-card__title">Tiến trình vòng đời</h2>
                <Timeline events={timelineEvents} />
              </div>

              <div className="monograph-card space-y-3">
                <span className="monograph-card__kicker">NỘI DUNG TÁC PHẨM</span>
                <h2 className="monograph-card__title">Cốt truyện &amp; Tác phẩm</h2>
                <p className="text-[14.5px] text-[var(--ink-lead)] leading-relaxed whitespace-pre-wrap m-0 font-serif">{item.config.story}</p>
              </div>

              <div className="monograph-card space-y-3">
                <span className="monograph-card__kicker">MINH BẠCH ON-CHAIN</span>
                <h2 className="monograph-card__title">Cam kết mã hóa</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--ink-subtle)] font-medium">Commitment Hash:</span>
                  <code className="font-mono text-xs bg-[var(--paper-bone)] text-[var(--ink-carbon)] px-2.5 py-1 rounded border border-[var(--border-hairline)] break-all select-all">
                    {item.commitmentHash}
                  </code>
                </div>
                {item.decisions.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <span className="text-xs text-[var(--ink-subtle)] font-medium">Quyết định thẩm định:</span>
                    <div className="flex flex-wrap gap-2">
                      {item.decisions.map((decision, index) => (
                        <div key={index} className="inline-flex items-center gap-1.5 text-xs bg-[var(--paper-bone)] text-[var(--ink-carbon)] px-2.5 py-1 rounded border border-[var(--border-hairline)]">
                          <span className="font-semibold">Resolver: {decision.outcome}</span>
                          <span className="text-[var(--ink-subtle)]">· {decision.reviewedAt}</span>
                          {(decision as { decisionReason?: string }).decisionReason && (
                            <span className="text-[var(--ink-lead)]">— {(decision as { decisionReason?: string }).decisionReason}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              {userId && state && state.state !== 4 && (state.state === 3 || chain.data!.challenges.length > 0) && (
                <div className="monograph-card space-y-3">
                  <span className="monograph-card__kicker">TRANH CHẤP &amp; KHIẾU NẠI</span>
                  <h2 className="monograph-card__title">Challenge trước khi chốt hoàn thành</h2>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[var(--ink-lead)]">
                    Lý do / bằng chứng chi tiết gửi Resolver
                    <textarea minLength={10} maxLength={2500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border border-[var(--border-hairline)] bg-white p-2.5 text-sm text-[var(--ink-carbon)] focus:outline-none focus:border-[var(--seal-vermilion)]" />
                  </label>
                  {own && state.state === 3 && (
                    <button disabled={busy || reason.trim().length < 10} className="button button--secondary" onClick={() => void work(async () => {
                      await campaignApi.comment(id, { targetHash: state.releaseEvidenceHash, kind: 'ISSUE', body: reason });
                      await tx.send('challengeRelease', [activeId, keccak256(toHex(JSON.stringify(['campaigns-challenge-v1', id, state.releaseEvidenceHash, reason])))], { expectedWallet: own.backerWallet });
                    })}>Gửi báo cáo và challenge bằng ví đã pledge</button>
                  )}
                  {chain.data!.challenges.map(challenge => (
                    <div key={challenge.backer} className="border-t border-[var(--border-hairline)] pt-3 space-y-1">
                      <p className="text-xs text-[var(--ink-lead)] m-0 break-all">{challenge.backer} · {challenge.resolved ? challenge.upheld ? 'Chấp nhận khiếu nại' : 'Bác khiếu nại' : 'Đang chờ Resolver'}<br />Bằng chứng: {challenge.evidenceHash}</p>
                      {canReview && !challenge.resolved && state.state === 3 && [true, false].map(upheld => (
                        <button disabled={busy || reason.trim().length < 10} key={String(upheld)} className="button button--secondary" onClick={() => void work(async () => {
                          const body = `${upheld ? 'UPHELD' : 'DISMISSED'}: ${reason}`;
                          await campaignApi.comment(id, { targetHash: challenge.evidenceHash, kind: 'COMMENT', body });
                          await tx.send('resolveChallenge', [activeId, challenge.backer, upheld, keccak256(toHex(body))]);
                        })}>
                          {upheld ? 'Chấp nhận: mở hoàn tiền toàn campaign' : 'Bác khiếu nại'}
                        </button>
                      ))}
                    </div>
                  ))}
                  <p className="text-xs text-[var(--ink-subtle)] m-0">Hết hạn challenge hoặc đã chốt hoàn thành: báo sự cố qua phản hồi bên dưới. Sau khi hoàn thành, phần surplus chỉ xử lý theo claim của từng Backer.</p>
                </div>
              )}

              {userId && state?.state !== 4 && (showPostFundingReview ? (
                <ReviewThread
                  campaignId={id}
                  userId={userId}
                  viewerMode={mode === 'creator' ? 'creator' : mode === 'resolver' ? 'resolver' : 'backer'}
                  targetHash={postFundingTarget}
                />
              ) : (
                <CommunityPanel
                  id={id}
                  userId={userId}
                  viewerMode={mode === 'creator' ? 'creator' : mode === 'resolver' ? 'resolver' : 'community'}
                  commitmentHash={item.commitmentHash}
                  evidence={evidence.data ?? []}
                />
              ))}
            </div>
          )}

          {chain.data && state && (
            <CompletionSettlementPanel
              campaignId={id}
              userId={userId}
              mode={mode}
              chain={chain.data}
              transaction={tx}
              entitlement={own}
              onRefresh={refresh}
            />
          )}

          {/* Technical Details (Always available) */}
          <details className="monograph-technical-details">
            <summary>Chi tiết kỹ thuật &amp; hợp đồng</summary>
            <div className="monograph-technical-details__body">
              Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />
              {onchainId && <>ID on-chain: <code>#{onchainId}</code></>}
            </div>
          </details>
        </div>

        {/* Right Column (Sidebar: The Notarial Ledger) */}
        <aside className="monograph-ledger" aria-label="Sổ công chứng ký quỹ">
          <div className="monograph-ledger__header">
            <span className="monograph-ledger__kicker">NOTARIAL ESCROW LEDGER</span>
            <h2 className="monograph-ledger__title">Funding summary</h2>
            <div className="monograph-ledger__amount">
              {state ? amount(state.raised) : '0 MockUSDC'}
            </div>
            <div className="monograph-ledger__meter" aria-hidden="true">
              <div
                className="monograph-ledger__meter-bar"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="monograph-ledger__ratio">
              {percent}% of {amount(item.config.goal)}
            </div>
          </div>

          {/* Deadlines */}
          <div className="monograph-ledger__dates">
            <div className="monograph-ledger__date-row">
              <span className="monograph-ledger__date-label">Funding deadline</span>
              <span className="monograph-ledger__date-val">
                {state ? formatDate(state.fundingDeadline) : `${item.config.fundingDuration / 86400} ngày`}
              </span>
            </div>
            <div className="monograph-ledger__date-row">
              <span className="monograph-ledger__date-label">Delivery deadline</span>
              <span className="monograph-ledger__date-val">
                {state && BigInt(state.releaseDeadline) > 0n ? formatDate(state.releaseDeadline) : 'Chưa chốt · Creator xác nhận khi hoàn thành campaign'}
              </span>
            </div>
          </div>

          {/* Actions & Lifecycle triggers */}
          {state && activeId !== null && (
            <div className="monograph-ledger__actions">
              {state.state === 4 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#b45309]">
                    {own?.access === 'REFUNDED'
                      ? 'Bạn đã nhận hoàn tiền'
                      : own?.access === 'REFUND_ELIGIBLE'
                      ? 'Khoản pledge của bạn đã đủ điều kiện hoàn tiền'
                      : 'Backer tự nhận hoàn tiền'}
                  </div>
                  <p className="text-xs text-[var(--ink-lead)] m-0">
                    {own?.access === 'REFUNDED'
                      ? 'Giao dịch hoàn tiền đã được ghi nhận. Bạn không cần thực hiện thêm bước nào.'
                      : own?.access === 'REFUND_ELIGIBLE'
                      ? 'Tiền sẽ trở về đúng ví đã dùng để pledge.'
                      : 'Resolver đã mở trạng thái hoàn tiền. Mỗi backer tự claim khoản của mình; Creator không nhận khoản này.'}
                  </p>
                  {userId && own?.access === 'REFUND_ELIGIBLE' && (
                    <button disabled={busy} className="button button--primary w-full" onClick={() => void tx.send('claimRefund', [activeId], { expectedWallet: own.backerWallet })}>
                      Nhận hoàn tiền vào ví đã pledge
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {fundingAwaitingFinalization && (
                    <p role="status" className="text-xs text-[#b45309] m-0">
                      Đã hết hạn gây quỹ · chờ chốt kết quả. Deadline đã qua nhưng contract chỉ chuyển sang hoàn tiền sau khi có giao dịch chốt kết quả. Resolver cần kết nối đúng ví Primary hoặc Backup để thực hiện bước này.
                    </p>
                  )}
                  {state.state === 3 && (
                    <p className="text-xs text-[var(--ink-subtle)] m-0">
                      Challenge đến {date(state.challengeDeadline)} · {state.openDisputes} tranh chấp mở. Chỉ gửi hồ sơ hoàn thành sau hạn và khi không còn tranh chấp.
                    </p>
                  )}
          {state.state === 0 && mode === 'public' && state.price && !fundingExpired && (
                    <PledgePreflight
                      campaignId={id}
                      userId={userId}
                      activeId={activeId}
                      price={state.price}
                      chain={chain.data!}
                      deployment={chain.data!.deployment}
                      transaction={tx.transaction?.action === 'pledge' ? tx.transaction : null}
                      busy={busy}
                      onPledge={quantity => void tx.send('pledge', [activeId, quantity], { pledgePrice: (BigInt(state.price) * quantity).toString() }).finally(() => { void chain.refetch(); })}
                      onReconcile={() => void tx.reconcile()}
                    />
                  )}
                  {userId && (
                    <div className="space-y-2">
                      {fundingAwaitingFinalization && mode === 'resolver' && !canReview && (
                        <p role="alert" className="text-xs text-[#dc2626] m-0">
                          Chưa thấy ví Resolver hợp lệ. Hãy chuyển MetaMask sang ví Primary hoặc Backup Resolver rồi refresh trang.
                        </p>
                      )}
                      {showFinalizeFunding && (
                        <button disabled={busy || !canReview} className="button button--secondary" onClick={() => void tx.send('finalizeFunding', [activeId])}>
                          Chốt kết quả khi hết hạn gây quỹ
                        </button>
                      )}
                      {showStartRefunds && (
                        <button disabled={busy || !canReview} className="button button--secondary w-full" onClick={() => void tx.send('startRefunds', [activeId])}>
                          Mở hoàn tiền khi quá hạn policy
                        </button>
                      )}
                      {mode === 'creator' && ![4, 5, 6].includes(state.state) && (
                        <button disabled={busy} className="button button--secondary w-full" onClick={() => void tx.send('cancelCampaign', [activeId], { expectedWallet: state.creator })}>
                          Hủy campaign và mở hoàn tiền toàn bộ
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!state && (
            <div className="monograph-ledger__tier">
              <span className="monograph-ledger__date-label">Tóm tắt tier</span>
              <div className="monograph-ledger__tier-price">
                <span>Giá 1 PDF:</span>
                <strong>{amount(item.config.tiers[0].price)}</strong>
              </div>
              <div className="mt-1">
                <StatusBadge state={uiState} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
    {feedbackComposerOpen && userId && mode !== 'creator' && (
      <FeedbackComposerModal
        id={id}
        commitmentHash={item.commitmentHash}
        evidence={evidence.data ?? []}
        onClose={() => setFeedbackComposerOpen(false)}
      />
    )}
    </>
  );
}

