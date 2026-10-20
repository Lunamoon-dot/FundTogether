import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountSession } from '../../../lib/api/auth';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi } from '../api/campaigns';
import { useTransaction } from '../transactions/useTransaction';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { ReviewThread } from '../shared/ui/ReviewThread';
import { CommunityPanel } from '../public/Community';
import { InternalCampaignFrame } from '../shared/workspace/InternalCampaignFrame';
import { CampaignDossierList } from '../shared/detail/CampaignDossierList';
import type { CampaignDetailFocus } from '../../explore/campaignRoutes';
import { ResolverCampaignActions } from './CampaignActions';
import '../shared/styles.css';

const zeroHash = `0x${'0'.repeat(64)}`;

export interface ResolverCampaignReviewPageProps {
  id: string;
  session: AccountSession;
  initialTab?: 'overview' | 'production' | 'commitments' | 'activity';
  focus?: CampaignDetailFocus;
}

export function ResolverCampaignReviewPage({ id, session, initialTab = 'overview', focus }: ResolverCampaignReviewPageProps): React.ReactElement {
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'resolver', session.userId],
    queryFn: ({ signal }) => campaignApi.operations('resolver', signal),
    enabled: Boolean(session.userId),
    refetchInterval: 10000,
  });
  const authorized = Boolean(operations.data?.some(operation => operation.campaignId === id));
  const preview = useQuery({
    queryKey: ['campaign-campaign-public', id],
    queryFn: ({ signal }) => campaignApi.preview(id, signal),
    enabled: authorized,
  });
  const approved = preview.data?.status === 'APPROVED' || preview.data?.status === 'PUBLISHED';
  const chain = useQuery({
    queryKey: ['campaign-campaign-chain', id],
    queryFn: ({ signal }) => campaignApi.chain(id, signal),
    enabled: authorized && approved,
    refetchInterval: 10000,
  });
  const terms = useQuery({
    queryKey: ['campaign-campaign-publication-terms', id, session.userId, 'resolver'],
    queryFn: () => campaignApi.terms(id),
    enabled: authorized && approved && Boolean(chain.data && ['NOT_PUBLISHED', 'ORPHANED'].includes(chain.data.status)),
  });
  const evidence = useQuery({
    queryKey: ['campaign-campaign-evidence', id, session.userId, 'resolver'],
    queryFn: ({ signal }) => campaignApi.evidence(id, true, signal),
    enabled: authorized && Boolean(preview.data),
  });
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`resolver-focus-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus, activeTab, preview.data, chain.data, evidence.data]);
  const refresh = () => {
    void operations.refetch();
    void preview.refetch();
    void chain.refetch();
    void terms.refetch();
    void evidence.refetch();
  };
  const tx = useTransaction(refresh, { userId: session.userId, campaignId: id });
  const busy = tx.busy;

  if (operations.isPending) return <p role="status">Đang xác nhận quyền Resolver…</p>;
  if (operations.error || !authorized) return <section className="panel review-notice review-notice--blocked" role="alert"><h1>Không có quyền mở workspace Resolver</h1><p>Campaign này không nằm trong phạm vi xử lý của Resolver hiện tại. Evidence riêng tư chưa được đọc.</p></section>;
  if (preview.isPending) return <p role="status">Đang tải campaign review…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;

  const item = preview.data;
  const state = chain.data?.snapshot;
  const timelineEvents: TimelineEvent[] = [
    { label: 'Chuẩn bị hồ sơ', detail: 'Hồ sơ đã khóa và có thể kiểm tra', tone: 'done' },
    { label: 'Thẩm định hồ sơ', detail: approved ? 'Resolver đã phê duyệt hồ sơ' : 'Đang chờ quyết định hồ sơ', tone: approved ? 'done' : 'current' },
    { label: 'Gây quỹ on-chain', detail: state ? state.state === 0 ? 'Đang mở gây quỹ' : state.state === 4 ? 'Đang hoàn tiền' : 'Giai đoạn gây quỹ hoàn tất' : 'Chưa có campaign canonical', tone: !state ? 'pending' : state.state === 0 ? 'current' : 'done' },
  ];
  timelineEvents.push({ label: 'Sản xuất & Duyệt PDF', detail: state?.productionApproved ? 'Bằng chứng đã được duyệt' : 'Chờ Creator gửi bằng chứng', tone: state?.productionApproved ? 'done' : state && state.state >= 1 ? 'current' : 'pending' });
  const alerts = <>
    {[tx.error, chain.error && getErrorMessage(chain.error), terms.error && getErrorMessage(terms.error), evidence.error && getErrorMessage(evidence.error)].filter(Boolean).map((message, index) => <div key={index} role="alert" className="monograph-alert monograph-alert--error mt-4">{String(message)}</div>)}
    {tx.notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{tx.notice}</div>}
    <div className="monograph-alert monograph-alert--info mt-4">Resolver workspace: các giao dịch tài chính chỉ mở sau khi contract/indexer xác nhận đúng state và ví hiện tại là Primary hoặc Backup Resolver.</div>
  </>;

  return <InternalCampaignFrame
    role="resolver"
    campaign={item}
    chain={chain.data ?? null}
    activeTab={activeTab}
    onTabChange={setActiveTab}
    alerts={alerts}
    main={<>
      {activeTab === 'overview' && <>
        <div className="monograph-card"><span className="monograph-card__kicker">EDITORIAL DOSSIER · PRIVATE REVIEW</span><h2 className="monograph-card__title">Hồ sơ Creator &amp; kế hoạch cam kết</h2><p className="monograph-card__desc">Resolver đọc hồ sơ riêng tư để quyết định đúng boundary. Backer không có quyền ký các quyết định này.</p><CampaignDossierList contentOutline={item.contentOutline} budgetPlan={item.budgetPlan} evidencePlan={item.evidencePlan} /></div>
        {chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy || terms.isFetching} section="overview" onActivate={() => undefined} onRefresh={refresh} onReconcile={() => { if (tx.transaction?.txHash) void tx.reconcile(); else if (chain.data?.bindingTransactionHash) void tx.reconcile('createCampaign', chain.data.bindingTransactionHash); else void chain.refetch(); }} />}
      </>}
      {activeTab === 'production' && <>
        <div className="monograph-card space-y-4"><span className="monograph-card__kicker">PRIVATE EVIDENCE REVIEW</span><h2 className="monograph-card__title">Bằng chứng sản xuất &amp; PDF cuối</h2><p className="monograph-card__desc">Các file dưới đây chỉ được tải trong boundary Resolver đã được backend cấp quyền.</p>{evidence.data?.map(proof => <article key={proof.id} className="border-t border-[var(--border-hairline)] pt-3 space-y-1"><strong>{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</strong><p className="text-sm">{proof.summary}</p><p className="text-xs font-mono break-all">{proof.sha256}<br />{proof.evidenceHash}</p></article>)}</div>
        {chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy} section="production" onRefresh={refresh} onActivate={() => undefined} onReconcile={() => void chain.refetch()} />}
      </>}
      {activeTab === 'commitments' && <div className="space-y-6"><div className="monograph-card space-y-4"><span className="monograph-card__kicker">VÒNG ĐỜI DỰ ÁN</span><h2 className="monograph-card__title">Tiến trình vòng đời</h2><Timeline events={timelineEvents} /></div><div id="resolver-focus-decisions" className="monograph-card space-y-3"><span className="monograph-card__kicker">NHẬT KÝ QUYẾT ĐỊNH</span><h2 className="monograph-card__title">Lịch sử quyết định Resolver</h2>{item.decisions.length === 0 ? <p className="monograph-card__desc">Chưa có quyết định thẩm định nào được ghi nhận.</p> : <div className="space-y-2">{item.decisions.map((decision, index) => <article key={`${decision.commitmentHash}-${decision.reviewedAt}-${index}`} className="border-t border-[var(--border-hairline)] pt-2"><strong>{decision.outcome}</strong><p className="text-sm text-[var(--ink-subtle)] m-0">{decision.reviewedAt}</p><code className="font-mono text-xs break-all">{decision.commitmentHash}</code></article>)}</div>}</div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">MINH BẠCH ON-CHAIN</span><h2 className="monograph-card__title">Cam kết mã hóa</h2><code className="font-mono text-xs break-all">{item.commitmentHash}</code></div></div>}
      {activeTab === 'activity' && <div className="space-y-6">{chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy} section="activity" onRefresh={refresh} onActivate={() => undefined} onReconcile={() => void chain.refetch()} />}<ReviewThread campaignId={id} userId={session.userId} viewerMode="resolver" targetHash={state && state.productionHash !== zeroHash ? state.productionHash : item.commitmentHash} /><CommunityPanel id={id} userId={session.userId} viewerMode="resolver" commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} /></div>}
      <details className="monograph-technical-details"><summary>Chi tiết kỹ thuật &amp; hợp đồng</summary><div className="monograph-technical-details__body">Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />{chain.data?.onchainCampaignId && <>ID on-chain: <code>#{chain.data.onchainCampaignId}</code></>}</div></details>
    </>}
  />;
}
