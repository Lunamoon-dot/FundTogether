import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountSession } from '../../../lib/api/auth';
import { getErrorMessage } from '../../../lib/api/error';
import { campaignApi } from '../api/campaigns';
import { getCampaignUiState } from '../shared/ui/campaignState';
import { Timeline, type TimelineEvent } from '../shared/ui/Timeline';
import { CampaignDetailFrame } from '../shared/detail/CampaignDetailFrame';
import { CampaignOverview } from '../shared/detail/CampaignOverview';
import { CampaignLedger } from '../shared/detail/CampaignLedger';
import { CampaignDossierList } from '../shared/detail/CampaignDossierList';
import '../shared/styles.css';

export interface AdminCampaignOperationsPageProps {
  id: string;
  session: AccountSession;
  initialTab?: 'overview' | 'production' | 'commitments' | 'activity';
}

export function AdminCampaignOperationsPage({ id, session, initialTab = 'overview' }: AdminCampaignOperationsPageProps): React.ReactElement {
  const operations = useQuery({
    queryKey: ['campaign-campaign-operations', 'admin', session.userId],
    queryFn: ({ signal }) => campaignApi.operations('admin', signal),
    enabled: Boolean(session.userId),
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
  const [activeTab, setActiveTab] = useState(initialTab);

  if (operations.isPending) return <p role="status">Đang xác nhận quyền Admin…</p>;
  if (operations.error || !authorized) return <section className="panel review-notice review-notice--blocked" role="alert"><h1>Không có quyền mở operations workspace</h1><p>Campaign không nằm trong projection vận hành hiện tại.</p></section>;
  if (preview.isPending) return <p role="status">Đang tải operations summary…</p>;
  if (!preview.data) return <p role="alert">{getErrorMessage(preview.error)}</p>;

  const item = preview.data;
  const state = chain.data?.snapshot;
  const uiState = getCampaignUiState({ status: item.status, chainState: state?.state, publicationStatus: chain.data?.status ?? null });
  const timelineEvents: TimelineEvent[] = [
    { label: 'Hồ sơ', detail: 'Campaign thuộc danh mục Comics & Artbooks', tone: 'done' },
    { label: 'Publication', detail: chain.data?.status === 'ON_CHAIN_CONFIRMED' ? 'Đã có binding canonical' : chain.data?.status === 'ORPHANED' ? 'Cần đối chiếu binding' : 'Chưa có binding canonical', tone: chain.data?.status === 'ON_CHAIN_CONFIRMED' ? 'done' : 'current' },
    { label: 'Contract', detail: state ? `State ${state.state} · raised ${state.raised}` : 'Chưa đọc được snapshot contract', tone: state ? 'current' : 'pending' },
  ];

  return <CampaignDetailFrame
    campaignId={id}
    activeTab={activeTab}
    onTabChange={setActiveTab}
    alerts={<div className="monograph-alert monograph-alert--info mt-4">Admin workspace chỉ đọc projection vận hành. Không có nút ký Resolver, payout, refund hoặc completion.</div>}
    main={<>
      <CampaignOverview campaign={item} chain={chain.data ?? null} uiState={uiState} timelineEvents={timelineEvents} showDetails={activeTab === 'overview'} />
      {activeTab === 'overview' && <div className="monograph-card"><span className="monograph-card__kicker">ADMIN · OPERATIONS SUMMARY</span><h2 className="monograph-card__title">Tóm tắt vận hành</h2><p className="monograph-card__desc">Đây là projection để theo dõi publication, indexer và lifecycle. Mọi quyết định tài chính thuộc Resolver workspace.</p><CampaignDossierList contentOutline={item.contentOutline} budgetPlan={item.budgetPlan} evidencePlan={item.evidencePlan} /></div>}
      {activeTab === 'production' && <div className="monograph-card space-y-3"><span className="monograph-card__kicker">ADMIN · PUBLIC PROJECTION</span><h2 className="monograph-card__title">Tiến độ công khai</h2><p className="monograph-card__desc">Admin không đọc evidence riêng tư và không duyệt file sản xuất trong workspace này.</p></div>}
      {activeTab === 'commitments' && <div className="monograph-card space-y-4"><span className="monograph-card__kicker">LIFECYCLE PROJECTION</span><h2 className="monograph-card__title">Tiến trình</h2><Timeline events={timelineEvents} /></div>}
      {activeTab === 'activity' && <div className="monograph-card space-y-3"><span className="monograph-card__kicker">ADMIN · READ ONLY</span><h2 className="monograph-card__title">Không có quyết định tài chính</h2><p className="monograph-card__desc">Phản hồi và quyết định Resolver được xem ở đúng workspace vai trò; Admin không ký thay Resolver.</p></div>}
      <details className="monograph-technical-details"><summary>Chi tiết kỹ thuật &amp; projection</summary><div className="monograph-technical-details__body">Commitment Hash: <code className="campaign-hash">{item.commitmentHash}</code><br />{chain.data?.onchainCampaignId && <>ID on-chain: <code>#{chain.data.onchainCampaignId}</code></>}</div></details>
    </>}
    ledger={<CampaignLedger campaign={item} chain={chain.data ?? null} />}
  />;
}

export const CampaignOperationsPage = AdminCampaignOperationsPage;
