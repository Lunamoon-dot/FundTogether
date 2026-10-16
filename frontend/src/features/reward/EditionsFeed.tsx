import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EditionsPreview } from '../../lib/api/editions';
import { editionsApi } from '../../lib/api/editions';
import { getErrorMessage } from '../../lib/api/error';
import { listRewardPublicCampaigns, type RewardCampaign } from '../../lib/api/reward';
import { getCampaignUiState, getProjectedChainState, type CampaignUiState } from './ui/campaignState';
import { EditorialCampaignCard } from './ui/EditorialCampaignCard';
import './reward.css';

type EditionsFeedFilter = 'all' | 'funding' | 'funded' | 'activation';

function getLegacyCampaignUiState(item: RewardCampaign): CampaignUiState {
  const chainState = getProjectedChainState(item.projection);
  const state = chainState ?? ({
    PUBLISHED: 0,
    ACTIVE: 1,
    PRODUCTION_VERIFIED: 2,
    FULFILLMENT_COMPLETE: 3,
    COMPLETED: 4,
    STOPPED: 5,
  } as Partial<Record<RewardCampaign['status'], number>>)[item.status];

  switch (state) {
    case 0:
      return { label: 'Đã đóng gây quỹ', tone: 'neutral', summary: 'Campaign Reward trước Editions · Không nhận pledge mới', actor: 'none', technicalCode: 'LEGACY_CLOSED' };
    case 1:
      return { label: 'Đã gây quỹ', tone: 'success', summary: 'Campaign đã đạt mục tiêu và chuyển sang thực hiện cam kết', actor: 'none', technicalCode: 'LEGACY_FUNDED' };
    case 2:
      return { label: 'Đã xác minh sản xuất', tone: 'success', summary: 'Campaign đã gây quỹ và hoàn tất xác minh sản xuất', actor: 'none', technicalCode: 'LEGACY_PRODUCTION_VERIFIED' };
    case 3:
      return { label: 'Đã hoàn tất giao nhận', tone: 'success', summary: 'Campaign đã gây quỹ và hoàn tất giao nhận', actor: 'none', technicalCode: 'LEGACY_FULFILLMENT_COMPLETE' };
    case 4:
      return { label: 'Đã hoàn tất', tone: 'success', summary: 'Campaign Reward đã hoàn tất vòng đời', actor: 'none', technicalCode: 'LEGACY_COMPLETED' };
    case 5:
      return { label: 'Đã dừng · hoàn tiền', tone: 'warning', summary: 'Campaign Reward đã dừng và xử lý quyền hoàn tiền theo deployment cũ', actor: 'none', technicalCode: 'LEGACY_STOPPED' };
    default:
      return { label: 'Hồ sơ Reward cũ', tone: 'neutral', summary: 'Campaign Reward trước Editions · Chỉ đọc lịch sử', actor: 'none', technicalCode: item.status };
  }
}

function isLegacyCampaignFunded(item: RewardCampaign) {
  const chainState = getProjectedChainState(item.projection);
  if (chainState !== null) return [1, 2, 3, 4].includes(chainState);
  return ['ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE', 'COMPLETED'].includes(item.status);
}

function EditionsPublicCard({ item }: { item: EditionsPreview | RewardCampaign }) {
  const isEditionsPreview = 'surface' in item;
  const uiState = isEditionsPreview
    ? getCampaignUiState({ status: item.status, chainState: item.surface === 'FUNDING' ? 0 : undefined })
    : getLegacyCampaignUiState(item);
  const href = isEditionsPreview ? `#/reward/editions/${item.id}` : `#/reward/campaigns/${item.id}`;
  const raised = !isEditionsPreview && typeof item.projection?.raised === 'string' ? item.projection.raised : undefined;
  return <EditorialCampaignCard campaign={item} state={uiState} href={href} raised={raised} />;
}

function EditionsPublicSurface({ title, description, items, empty }: { title: string; description: string; items: EditionsPreview[] | undefined; empty: string }) {
  return (
    <section className="editions-public-surface" aria-label={title}>
      <div className="editions-public-surface__heading">
        <div>
          <span className="editions-public-surface__preface">SELECTION SHELF</span>
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

export function EditionsFeed({ initialFilter = 'all' }: { initialFilter?: EditionsFeedFilter } = {}) {
  const [filter, setFilter] = useState<EditionsFeedFilter>(initialFilter);
  const activation = useQuery({ queryKey: ['reward-editions-public', 'activation'], queryFn: ({ signal }) => editionsApi.activation(signal) });
  const funding = useQuery({ queryKey: ['reward-editions-public', 'funding'], queryFn: ({ signal }) => editionsApi.funding(signal) });
  const legacy = useQuery({ queryKey: ['reward-public-campaigns'], queryFn: ({ signal }) => listRewardPublicCampaigns(signal) });
  const loading = activation.isPending || funding.isPending || legacy.isPending;
  const error = activation.error || funding.error || legacy.error;

  const fundingItems = funding.data ?? [];
  const activationItems = activation.data ?? [];
  const legacyItems = legacy.data ?? [];
  const allById = new Map<string, EditionsPreview | RewardCampaign>();
  for (const item of fundingItems) allById.set(item.id, item);
  for (const item of activationItems) if (!allById.has(item.id)) allById.set(item.id, item);
  for (const item of legacyItems) if (!allById.has(item.id)) allById.set(item.id, item);
  const allItems = Array.from(allById.values());
  const fundedItems = legacyItems.filter(isLegacyCampaignFunded);
  const displayedItems = filter === 'funding'
    ? fundingItems
    : filter === 'funded'
      ? fundedItems
      : filter === 'activation'
        ? activationItems
        : allItems;

  return (
    <div className="reward-container editions-feed-page">
      {loading && <p role="status" className="muted">Đang tải trạng thái Editions…</p>}
      {error && <p role="alert" className="toast toast--error">{getErrorMessage(error)}</p>}
      <h1 className="sr-only">FundTogether Editions</h1>
      <div className="editions-feed-toolbar">
        <div className="editions-filter-bar" role="group" aria-label="Lọc ấn phẩm theo trạng thái">
          <button type="button" aria-pressed={filter === 'all'} className={`editions-filter-btn ${filter === 'all' ? 'editions-filter-btn--active' : ''}`} onClick={() => setFilter('all')}>
            Tất cả <span className="editions-filter-count">{allItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'funding'} className={`editions-filter-btn ${filter === 'funding' ? 'editions-filter-btn--active' : ''}`} onClick={() => setFilter('funding')}>
            Đang gây quỹ <span className="editions-filter-count">{fundingItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'funded'} aria-label={`Campaign đã gây quỹ thành công: ${fundedItems.length}`} className={`editions-filter-btn ${filter === 'funded' ? 'editions-filter-btn--active' : ''}`} onClick={() => setFilter('funded')}>
            Đã gây quỹ <span className="editions-filter-count">{fundedItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'activation'} aria-label={`Chờ Creator và Resolver kích hoạt: ${activationItems.length}`} className={`editions-filter-btn ${filter === 'activation' ? 'editions-filter-btn--active' : ''}`} onClick={() => setFilter('activation')}>
            Chờ kích hoạt <span className="editions-filter-count">{activationItems.length}</span>
          </button>
        </div>
      </div>
      {displayedItems.length > 0 ? (
        <div className="editions-shelf-grid" aria-live="polite">
          {displayedItems.map(item => <EditionsPublicCard item={item} key={item.id} />)}
        </div>
      ) : (
        <section className="editions-feed-empty" aria-live="polite">
          <h2>{filter === 'all' ? 'Chưa có ấn phẩm nào' : 'Không có ấn phẩm phù hợp'}</h2>
          <p>
            {filter === 'funding'
              ? 'Chưa có campaign nào đang nhận pledge.'
              : filter === 'funded'
                ? 'Chưa có campaign nào đã gây quỹ thành công.'
                : filter === 'activation'
                  ? 'Không có hồ sơ nào đang chờ kích hoạt.'
                  : 'Hiện chưa có campaign nào trong danh mục Editions.'}
          </p>
          {filter !== 'all' && (
            <div className="editions-feed-empty__actions">
              <button type="button" className="edition-secondary-link" onClick={() => setFilter('all')}>Xem tất cả ấn phẩm</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function EditionsCommunityReviewPage() {
  const review = useQuery({ queryKey: ['reward-editions-public', 'review'], queryFn: ({ signal }) => editionsApi.review(signal) });
  return (
    <div className="reward-container editions-community-review-page">
      <a className="public-back" href="#/reward">← Về trang Editions</a>
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
