import type { Campaign, OperationSummary } from '../../api/campaigns';
import { getCampaignUiState } from './campaignState';
import { StatusBadge } from './StatusBadge';

interface ReviewQueueProps {
  campaigns: Campaign[];
  operations?: OperationSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
  className?: string;
}

export function ReviewQueue({
  campaigns = [],
  operations = [],
  selectedId,
  onSelect,
  onRefresh,
  className = '',
}: ReviewQueueProps) {
  if (campaigns.length === 0) {
    return (
      <div className={`review-queue review-queue--empty ${className}`.trim()}>
        <div className="campaign-compact-empty">
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
      items: campaigns.filter(c => ['APPROVED', 'PUBLISHED'].includes(c.status) &&
        (operations.find(item => item.campaignId === c.id)?.publicationStatus ?? 'NOT_PUBLISHED') === 'NOT_PUBLISHED'),
    },
    {
      title: 'Cần đối chiếu giao dịch',
      items: campaigns.filter(c => operations.find(item => item.campaignId === c.id)?.publicationStatus === 'ORPHANED'),
    },
    {
      title: 'Đang gây quỹ',
      items: campaigns.filter(c => operations.find(item => item.campaignId === c.id)?.contractState === 0),
    },
    {
      title: 'Sản xuất / duyệt phát hành',
      items: campaigns.filter(c => [1, 2, 3].includes(operations.find(item => item.campaignId === c.id)?.contractState ?? -1)),
    },
    {
      title: 'Đang hoàn tiền',
      items: campaigns.filter(c => operations.find(item => item.campaignId === c.id)?.contractState === 4),
    },
    {
      title: 'Đã quyết toán',
      items: campaigns.filter(c => operations.find(item => item.campaignId === c.id)?.contractState === 5),
    },
    {
      title: 'Đang đồng bộ canonical',
      items: campaigns.filter(c => {
        const operation = operations.find(item => item.campaignId === c.id);
        return operation?.publicationStatus === 'ON_CHAIN_CONFIRMED' && operation.contractState === null;
      }),
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
                const operation = operations.find(item => item.campaignId === c.id);
                const uiState = getCampaignUiState({ status: c.status, chainState: operation?.contractState,
                  publicationStatus: operation?.publicationStatus, role: 'resolver' });
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
                      <span className="review-queue__item-title">{c.title || 'Campaign'}</span>
                      <StatusBadge state={uiState} />
                    </div>
                    {operation?.onchainCampaignId && (
                      <span className="review-queue__item-meta">On-chain #{operation.onchainCampaignId}</span>
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
