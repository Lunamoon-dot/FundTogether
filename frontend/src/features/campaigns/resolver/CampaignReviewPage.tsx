import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountSession } from '../../../lib/api/auth';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi } from '../api/campaigns';
import { useTransaction } from '../transactions/useTransaction';
import { getCampaignUiState } from '../shared/ui/campaignState';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { ReviewThread } from '../shared/ui/ReviewThread';
import { CommunityPanel } from '../public/Community';
import { CampaignDetailFrame } from '../shared/detail/CampaignDetailFrame';
import { CampaignOverview } from '../shared/detail/CampaignOverview';
import { CampaignLedger } from '../shared/detail/CampaignLedger';
import { CampaignDossierList } from '../shared/detail/CampaignDossierList';
import { ResolverCampaignActions } from './CampaignActions';
import '../shared/styles.css';

const zeroHash = `0x${'0'.repeat(64)}`;

export interface ResolverCampaignReviewPageProps {
  id: string;
  session: AccountSession;
  initialTab?: 'overview' | 'production' | 'commitments' | 'activity';
}

export function ResolverCampaignReviewPage({ id, session, initialTab = 'overview' }: ResolverCampaignReviewPageProps): React.ReactElement {
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const refresh = () => {
    void operations.refetch();
    void preview.refetch();
    void chain.refetch();
    void terms.refetch();
    void evidence.refetch();
  };
  const tx = useTransaction(refresh, { userId: session.userId, campaignId: id });
  const busy = working || tx.busy;

  async function work(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); } finally { setWorking(false); }
  }

  async function activate() {
    await work(async () => {
      const result = await terms.refetch();
      if (!result.data) throw new Error('Chưa đọc được commitment publication.');
      if (result.data.onchainApproved) throw new Error('Commitment đã được Resolver ký; chờ Creator tạo campaign.');
      await tx.send('approveCampaign', [result.data.creatorWallet, BigInt(result.data.goal), BigInt(result.data.price), BigInt(result.data.fundingDuration), result.data.commitmentHash], { expectedWallet: result.data.deployment.resolver });
    });
  }

  if (operations.isPending) return <p role="status">Đang xác nhận quyền Resolver…</p>;
  if (operations.error || !authorized) return <section className="panel review-notice review-notice--blocked" role="alert"><h1>Không có quyền mở workspace Resolver</h1><p>Campaign này không nằm trong phạm vi xử lý của Resolver hiện tại. Evidence riêng tư chưa được đọc.</p></section>;
  if (preview.isPending) return <p role="status">Đang tải campaign review…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;

  const item = preview.data;
  const state = chain.data?.snapshot;
  const uiState = getCampaignUiState({ status: item.status, chainState: state?.state, publicationStatus: chain.data?.status ?? null, role: 'resolver' });
  const timelineEvents: TimelineEvent[] = [
    { label: 'Chuẩn bị hồ sơ', detail: 'Hồ sơ đã khóa và có thể kiểm tra', tone: 'done' },
    { label: 'Thẩm định hồ sơ', detail: approved ? 'Resolver đã phê duyệt hồ sơ' : 'Đang chờ quyết định hồ sơ', tone: approved ? 'done' : 'current' },
    { label: 'Gây quỹ on-chain', detail: state ? state.state === 0 ? 'Đang mở gây quỹ' : state.state === 4 ? 'Đang hoàn tiền' : 'Giai đoạn gây quỹ hoàn tất' : 'Chưa có campaign canonical', tone: !state ? 'pending' : state.state === 0 ? 'current' : 'done' },
  ];
  timelineEvents.push({ label: 'Sản xuất & Duyệt PDF', detail: state?.productionApproved ? 'Bằng chứng đã được duyệt' : 'Chờ Creator gửi bằng chứng', tone: state?.productionApproved ? 'done' : state && state.state >= 1 ? 'current' : 'pending' });
  const alerts = <>
    {[error, tx.error, chain.error && getErrorMessage(chain.error), terms.error && getErrorMessage(terms.error), evidence.error && getErrorMessage(evidence.error)].filter(Boolean).map((message, index) => <div key={index} role="alert" className="monograph-alert monograph-alert--error mt-4">{String(message)}</div>)}
    {notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{notice}</div>}
    {tx.notice && <div role="status" className="monograph-alert monograph-alert--success mt-4">{tx.notice}</div>}
    <div className="monograph-alert monograph-alert--info mt-4">Resolver workspace: các giao dịch tài chính chỉ mở sau khi contract/indexer xác nhận đúng state và ví hiện tại là Primary hoặc Backup Resolver.</div>
  </>;

  return <CampaignDetailFrame
    campaignId={id}
    activeTab={activeTab}
    onTabChange={setActiveTab}
    alerts={alerts}
    main={<>
      <CampaignOverview campaign={item} chain={chain.data ?? null} uiState={uiState} timelineEvents={timelineEvents} showDetails={activeTab === 'overview'} />
      {activeTab === 'overview' && <>
        <div className="monograph-card"><span className="monograph-card__kicker">EDITORIAL DOSSIER · PRIVATE REVIEW</span><h2 className="monograph-card__title">Hồ sơ Creator &amp; kế hoạch cam kết</h2><p className="monograph-card__desc">Resolver đọc hồ sơ riêng tư để quyết định đúng boundary. Backer không có quyền ký các quyết định này.</p><CampaignDossierList contentOutline={item.contentOutline} budgetPlan={item.budgetPlan} evidencePlan={item.evidencePlan} /></div>
        {chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy || terms.isFetching} section="overview" onRefresh={refresh} onActivate={() => void activate()} onReconcile={() => { if (tx.transaction?.txHash) void tx.reconcile(); else if (chain.data?.bindingTransactionHash) void tx.reconcile('createCampaign', chain.data.bindingTransactionHash); else void chain.refetch(); }} />}
      </>}
      {activeTab === 'production' && <>
        <div className="monograph-card space-y-4"><span className="monograph-card__kicker">PRIVATE EVIDENCE REVIEW</span><h2 className="monograph-card__title">Bằng chứng sản xuất &amp; PDF cuối</h2><p className="monograph-card__desc">Các file dưới đây chỉ được tải trong boundary Resolver đã được backend cấp quyền.</p>{evidence.data?.map(proof => <article key={proof.id} className="border-t border-[var(--border-hairline)] pt-3 space-y-1"><strong>{proof.purpose === 'FINAL_PDF' ? 'PDF cuối' : 'Bằng chứng sản xuất'}</strong><p className="text-sm">{proof.summary}</p><p className="text-xs font-mono break-all">{proof.sha256}<br />{proof.evidenceHash}</p></article>)}</div>
        {chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy} section="production" onRefresh={refresh} onActivate={() => void activate()} onReconcile={() => void chain.refetch()} />}
      </>}
      {activeTab === 'commitments' && <div className="space-y-6"><div className="monograph-card space-y-4"><span className="monograph-card__kicker">VÒNG ĐỜI DỰ ÁN</span><h2 className="monograph-card__title">Tiến trình vòng đời</h2><Timeline events={timelineEvents} /></div><div className="monograph-card space-y-3"><span className="monograph-card__kicker">MINH BẠCH ON-CHAIN</span><h2 className="monograph-card__title">Cam kết mã hóa</h2><code className="font-mono text-xs break-all">{item.commitmentHash}</code></div></div>}
      {activeTab === 'activity' && <div className="space-y-6">{chain.data && <ResolverCampaignActions campaignId={id} userId={session.userId} chain={chain.data} terms={terms.data} evidence={evidence.data ?? []} transaction={tx} busy={busy} section="activity" onRefresh={refresh} onActivate={() => void activate()} onReconcile={() => void chain.refetch()} />}<ReviewThread campaignId={id} userId={session.userId} viewerMode="resolver" targetHash={state && state.productionHash !== zeroHash ? state.productionHash : item.commitmentHash} /><CommunityPanel id={id} userId={session.userId} viewerMode="resolver" commitmentHash={item.commitmentHash} evidence={evidence.data ?? []} /></div>}
      <details className="monograph-technical-details"><summary>Chi tiết kỹ thuật &amp; hợp đồng</summary><div className="monograph-technical-details__body">Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />{chain.data?.onchainCampaignId && <>ID on-chain: <code>#{chain.data.onchainCampaignId}</code></>}</div></details>
    </>}
    ledger={<CampaignLedger campaign={item} chain={chain.data ?? null} />}
  />;
}
