import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CampaignPreview } from '../api/campaigns';
import { campaignApi } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { getCampaignUiState } from '../shared/ui/campaignState';
import { EditorialCampaignCard } from '../shared/ui/EditorialCampaignCard';
import '../shared/styles.css';

type FeedFilter = 'all' | 'funding' | 'funded' | 'activation';

function PublicCard({ item }: { item: CampaignPreview }) {
  const uiState = getCampaignUiState({
    status: item.status,
    chainState: item.chainState ?? (item.surface === 'FUNDING' ? 0 : undefined),
    publicationStatus: item.surface === 'ACTIVATION_PENDING' ? 'NOT_PUBLISHED' : item.surface === 'ORPHANED' ? 'ORPHANED' : undefined,
  });
  return <EditorialCampaignCard campaign={item} state={uiState} href={`#/campaigns/${item.id}`} />;
}

function PublicSurface({ title, description, items, empty }: { title: string; description: string; items: CampaignPreview[] | undefined; empty: string }) {
  return (
    <section className="campaign-public-surface" aria-label={title}>
      <div className="campaign-public-surface__heading public-sr-only sr-only">
        <div>
          <span className="campaign-public-surface__preface">SELECTION SHELF</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="campaign-public-surface__count">{items?.length ?? 0}</span>
      </div>
      {items?.length ? (
        <div className="campaign-shelf-grid">
          {items.map(item => <PublicCard item={item} key={item.id} />)}
        </div>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  );
}

export function Feed({ initialFilter = 'all' }: { initialFilter?: FeedFilter } = {}) {
  const [filter, setFilter] = useState<FeedFilter>(initialFilter);
  const activation = useQuery({ queryKey: ['campaign-campaign-public', 'activation'], queryFn: ({ signal }) => campaignApi.activation(signal) });
  const orphaned = useQuery({ queryKey: ['campaign-campaign-public', 'orphaned'], queryFn: ({ signal }) => campaignApi.orphaned(signal) });
  const funded = useQuery({ queryKey: ['campaign-campaign-public', 'funded'], queryFn: ({ signal }) => campaignApi.funded(signal) });
  const funding = useQuery({ queryKey: ['campaign-campaign-public', 'funding'], queryFn: ({ signal }) => campaignApi.funding(signal) });
  const loading = activation.isPending || orphaned.isPending || funded.isPending || funding.isPending;
  const error = activation.error || orphaned.error || funded.error || funding.error;

  const fundingItems = funding.data ?? [];
  const fundedItems = funded.data ?? [];
  const activationItems = activation.data ?? [];
  const orphanedItems = orphaned.data ?? [];
  const allById = new Map<string, CampaignPreview>();
  for (const item of fundingItems) allById.set(item.id, item);
  for (const item of fundedItems) if (!allById.has(item.id)) allById.set(item.id, item);
  for (const item of activationItems) if (!allById.has(item.id)) allById.set(item.id, item);
  for (const item of orphanedItems) if (!allById.has(item.id)) allById.set(item.id, item);
  const allItems = Array.from(allById.values());
  const displayedItems = filter === 'funding'
    ? fundingItems
    : filter === 'funded'
      ? fundedItems
      : filter === 'activation'
        ? activationItems
        : allItems;

  return (
    <div className="campaign-container campaign-feed-page">
      {loading && <p role="status" className="muted">Đang tải trạng thái campaign…</p>}
      {error && <p role="alert" className="toast toast--error">{getErrorMessage(error)}</p>}
      <h1 className="sr-only">FundTogether</h1>
      <div className="campaign-feed-toolbar">
        <div className="campaign-filter-bar" role="group" aria-label="Lọc ấn phẩm theo trạng thái">
          <button type="button" aria-pressed={filter === 'all'} className={`campaign-filter-btn ${filter === 'all' ? 'campaign-filter-btn--active' : ''}`} onClick={() => setFilter('all')}>
            Tất cả <span className="campaign-filter-count">{allItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'funding'} className={`campaign-filter-btn ${filter === 'funding' ? 'campaign-filter-btn--active' : ''}`} onClick={() => setFilter('funding')}>
            Đang gây quỹ <span className="campaign-filter-count">{fundingItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'funded'} aria-label={`Campaign đã gây quỹ thành công: ${fundedItems.length}`} className={`campaign-filter-btn ${filter === 'funded' ? 'campaign-filter-btn--active' : ''}`} onClick={() => setFilter('funded')}>
            Đã gây quỹ <span className="campaign-filter-count">{fundedItems.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'activation'} aria-label={`Chờ Creator và Resolver kích hoạt: ${activationItems.length}`} className={`campaign-filter-btn ${filter === 'activation' ? 'campaign-filter-btn--active' : ''}`} onClick={() => setFilter('activation')}>
            Chờ kích hoạt <span className="campaign-filter-count">{activationItems.length}</span>
          </button>
        </div>
      </div>
      {displayedItems.length > 0 ? (
        <div className="campaign-shelf-grid" aria-live="polite">
          {displayedItems.map(item => <PublicCard item={item} key={item.id} />)}
        </div>
      ) : (
        <section className="campaign-feed-empty" aria-live="polite">
          <h2>{filter === 'all' ? 'Chưa có ấn phẩm nào' : 'Không có ấn phẩm phù hợp'}</h2>
          <p>
            {filter === 'funding'
              ? 'Chưa có campaign nào đang nhận pledge.'
              : filter === 'funded'
                ? 'Chưa có campaign nào đã gây quỹ thành công.'
                : filter === 'activation'
                  ? 'Không có hồ sơ nào đang chờ kích hoạt.'
                  : 'Hiện chưa có campaign nào trong danh mục hiện tại.'}
          </p>
          {filter !== 'all' && (
            <div className="campaign-feed-empty__actions">
              <button type="button" className="campaign-secondary-link" onClick={() => setFilter('all')}>Xem tất cả ấn phẩm</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function CommunityReviewPage() {
  const review = useQuery({ queryKey: ['campaign-campaign-public', 'review'], queryFn: ({ signal }) => campaignApi.review(signal) });
  return (
    <div className="campaign-container campaign-community-review-page">
      <a className="public-back" href="#/campaigns">← Về trang campaign</a>
      {review.isPending && <p role="status">Đang tải hồ sơ community review…</p>}
      {review.error && <p role="alert">{getErrorMessage(review.error)}</p>}
      <PublicSurface
        title="Community review đang mở"
        description="Hồ sơ đã được Resolver mở cho cộng đồng góp ý; chưa được duyệt và chưa mở pledge."
        items={review.data}
        empty="Chưa có hồ sơ nào đang mở community review."
      />
    </div>
  );
}
