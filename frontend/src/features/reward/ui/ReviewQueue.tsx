import type { RewardCampaign } from '../../../lib/api/reward';
import { getCampaignUiState } from './campaignState';
import { EditionStatusBadge } from './EditionStatusBadge';

interface ReviewQueueProps {
  campaigns: RewardCampaign[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  className?: string;
}

export function ReviewQueue({
  campaigns = [],
  selectedId,
  onSelect,
  onRefresh,
  className = '',
}: ReviewQueueProps) {
  if (campaigns.length === 0) {
    return (
      <div className={`review-queue review-queue--empty ${className}`.trim()}>
        <div className="edition-compact-empty">
          <p><strong>Không có hồ sơ cần thẩm định</strong></p>
          <p className="muted">Dữ liệu đồng bộ gần nhất từ Indexer. Các hồ sơ mới sẽ hiển thị khi Creator gửi thẩm định.</p>
          {onRefresh && (
            <button
              type="button"
              className="button button--secondary"
              onClick={onRefresh}
            >
              Làm mới hàng đợi
            </button>
          )}
        </div>
      </div>
    );
  }

  const groups = [
    {
      title: 'Cần mở review',
      items: campaigns.filter(c => ['UNDER_REVIEW_PRIVATE', 'UNDER_REVIEW'].includes(c.status)),
    },
    {
      title: 'Community review',
      items: campaigns.filter(c => c.status === 'COMMUNITY_REVIEW'),
    },
    {
      title: 'Chờ kích hoạt',
      items: campaigns.filter(c => c.status === 'APPROVED'),
    },
    {
      title: 'Cần xử lý sau deadline',
      items: campaigns.filter(c => ['ACTIVE', 'PRODUCTION_VERIFIED', 'STOPPED', 'COMPLETED'].includes(c.status)),
    },
  ];

  return (
    <div className={`review-queue ${className}`.trim()} role="region" aria-label="Hàng đợi thẩm định">
      {groups.map(group => {
        if (group.items.length === 0) return null;
        return (
          <div key={group.title} className="review-queue__group">
            <div className="review-queue__group-header">
              <span className="review-queue__group-title">{group.title}</span>
              <span className="review-queue__group-count">{group.items.length}</span>
            </div>
            <div className="review-queue__list" role="listbox">
              {group.items.map(c => {
                const isSelected = selectedId === c.id;
                const uiState = getCampaignUiState({ status: c.status, role: 'resolver' });
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`review-queue__item ${isSelected ? 'review-queue__item--selected' : ''}`}
                    onClick={() => onSelect(c.id)}
                  >
                    <div className="review-queue__item-top">
                      <span className="review-queue__item-title">{c.title || 'Editions Campaign'}</span>
                      <EditionStatusBadge state={uiState} />
                    </div>
                    {c.onchainCampaignId && (
                      <span className="review-queue__item-meta">On-chain #{c.onchainCampaignId}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
