import type { Campaign } from '../../api/campaigns';
import { getCampaignUiState, getProjectedChainState } from './campaignState';
import { StatusBadge } from './StatusBadge';

interface ReviewHistoryItem {
  outcome: string;
  reason?: string;
  reviewedAt?: string;
}

interface CreatorCampaignWithHistory extends Campaign {
  reviewHistory?: ReviewHistoryItem[];
}

interface CreatorTaskCardProps {
  campaign: CreatorCampaignWithHistory;
  href: string;
  chainState?: number | null;
  className?: string;
}

export function CreatorTaskCard({ campaign, href, chainState: suppliedChainState, className = '' }: CreatorTaskCardProps) {
  const chainState = suppliedChainState ?? getProjectedChainState(campaign.projection);
  const uiState = getCampaignUiState({
    status: campaign.status,
    chainState,
    role: 'creator',
  });

  const revision = campaign.revision ?? 1;
  const history: ReviewHistoryItem[] = campaign.reviewHistory ?? [];

  let taskAction = 'Tiếp tục hoàn thiện hồ sơ →';
  let taskInstruction = 'Hoàn thiện thông tin ấn phẩm, mục tiêu gây quỹ và tài liệu mẫu.';

  if (campaign.status === 'CHANGES_REQUESTED') {
    taskAction = 'Chỉnh sửa hồ sơ theo yêu cầu →';
    taskInstruction = 'Resolver đã gửi yêu cầu chỉnh sửa. Vui lòng cập nhật các mục cần sửa và lưu lại bản thảo.';
  } else if (campaign.status === 'FROZEN') {
    taskAction = 'Gửi thẩm định Resolver →';
    taskInstruction = 'Hồ sơ đã được khóa. Gửi thẩm định để Resolver bắt đầu kiểm tra.';
  } else if (campaign.status === 'UNDER_REVIEW_PRIVATE') {
    taskAction = 'Theo dõi tiến trình thẩm định →';
    taskInstruction = 'Resolver đang kiểm tra riêng hồ sơ; chưa mở góp ý cộng đồng.';
  } else if (campaign.status === 'COMMUNITY_REVIEW') {
    taskAction = 'Xem phản hồi cộng đồng →';
    taskInstruction = 'Đang mở lấy ý kiến cộng đồng. Độc giả có thể gửi góp ý tham khảo.';
  } else if (campaign.status === 'APPROVED' || campaign.status === 'PUBLISHED') {
    taskAction = 'Mở trang kích hoạt on-chain →';
    taskInstruction = 'Hồ sơ đã được duyệt thành công. Tiến hành kích hoạt campaign trên smart contract.';
  }

  if (chainState === 1) {
    taskAction = 'Cập nhật tiến độ sản xuất →';
    taskInstruction = 'Campaign đã đạt mục tiêu. Cập nhật bằng chứng sản xuất để Resolver kiểm tra.';
  } else if (chainState === 3) {
    taskAction = 'Gửi hồ sơ hoàn thành →';
    taskInstruction = 'Challenge đã đủ điều kiện. Creator cần nộp hồ sơ hoàn thành; Resolver sẽ tự quyết định duyệt hoặc yêu cầu sửa.';
  }

  return (
    <article className={`panel creator-task-card creator-task-card--${uiState.tone} ${className}`.trim()}>
      <div className="creator-task-card__header">
        <div className="creator-task-card__title-row">
          <h3 className="creator-task-card__title">{campaign.title || 'Bản thảo campaign'}</h3>
          <span className="creator-task-card__revision">Revision #{revision}</span>
        </div>
        <StatusBadge state={uiState} />
      </div>

      <div className="creator-task-card__body">
        <span className="creator-task-card__eyebrow">Cần bạn làm:</span>
        <p className="creator-task-card__instruction">{taskInstruction}</p>
      </div>

      <div className="creator-task-card__actions">
        <a className="button button--primary" href={href}>
          {taskAction}
        </a>
      </div>

      {history.length > 0 && (
        <details className="creator-task-card__history">
          <summary>Lịch sử thẩm định ({history.length})</summary>
          <ul className="creator-task-card__history-list">
            {history.map((h, idx) => (
              <li key={idx} className="creator-task-card__history-item">
                <strong>{h.outcome}</strong>
                {h.reason && <p className="creator-task-card__history-reason">{h.reason}</p>}
                {h.reviewedAt && (
                  <span className="creator-task-card__history-time">
                    {new Date(h.reviewedAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
