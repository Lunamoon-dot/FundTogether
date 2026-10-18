import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { campaignApi } from '../api/campaigns';
import type { Entitlement } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { StatusBadge } from '../shared/ui/StatusBadge';
import { getCampaignUiState } from '../shared/ui/campaignState';
import '../shared/styles.css';

const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;
function userFacingError(message: string) {
  return message === 'Creator or Resolver required' ? 'Khu vực kiểm tra riêng tư chỉ dành cho Creator hoặc Resolver.' : message;
}

function entitlementPresentation(access: Entitlement['access']) {
  switch (access) {
    case 'REFUND_ELIGIBLE': return { label: 'Có thể nhận hoàn tiền', tone: 'warning' as const, description: 'Campaign không đạt mục tiêu. Khoản pledge của bạn đang chờ nhận lại.' };
    case 'REFUNDED': return { label: 'Đã hoàn tiền', tone: 'neutral' as const, description: 'Khoản pledge đã được trả lại về ví đã dùng để ủng hộ.' };
    case 'DOWNLOAD_ELIGIBLE': return { label: 'PDF đã sẵn sàng', tone: 'success' as const, description: 'Bạn có thể mở campaign để kiểm tra và tải PDF riêng tư.' };
    case 'DELIVERY_UNAVAILABLE': return { label: 'PDF cần kiểm tra', tone: 'danger' as const, description: 'Resolver đã duyệt trên chain nhưng máy chủ chưa tìm thấy đúng file PDF đã cam kết.' };
    case 'PENDING_RELEASE': return { label: 'Đang chờ PDF', tone: 'info' as const, description: 'Pledge đã được ghi nhận; Resolver chưa duyệt bản PDF cuối.' };
    case 'ORPHANED': return { label: 'Không còn hợp lệ', tone: 'danger' as const, description: 'Giao dịch này không còn thuộc deployment canonical hiện tại.' };
  }
}
function EntitlementCard({ item }: { item: Entitlement }) {
  const presentation = entitlementPresentation(item.access);
  const uiState = getCampaignUiState({ access: item.access });
  const detailHref = `#/campaigns/${item.campaignId}`;
  return (
    <article className={`panel campaign-entitlement-card campaign-entitlement-card--${presentation.tone}`}>
      <div className="campaign-entitlement-card__header">
        <div className="campaign-entitlement-card__title-group">
          <span className="campaign-eyebrow">Khoản hỗ trợ</span>
          <h2 className="campaign-entitlement-card__title">{item.campaignTitle}</h2>
        </div>
        <div className="campaign-entitlement-card__meta">
          <span className="campaign-entitlement-card__amount">{amount(item.amountPaid)}</span>
          <StatusBadge state={uiState} />
        </div>
      </div>

      <p className="campaign-entitlement-card__description">{presentation.description}</p>

      {item.access === 'REFUND_ELIGIBLE' && (
        <div className="campaign-next-action campaign-next-action--refund">
          <div className="campaign-next-action__text">
            <strong>Việc cần làm tiếp theo</strong>
            <p>Nhận hoàn tiền về đúng ví đã pledge.</p>
          </div>
          <a className="button button--primary campaign-next-action__btn" href={detailHref}>Mở campaign để nhận hoàn tiền →</a>
        </div>
      )}

      <div className="campaign-entitlement-card__footer">
        <div className="campaign-entitlement-card__actions">
          {item.access === 'REFUNDED' && (
            <p className="campaign-complete-state">✓ Đã hoàn tiền. Không còn bước nào cần thực hiện.</p>
          )}
          {item.access === 'DOWNLOAD_ELIGIBLE' && (
            <a className="button button--primary campaign-entitlement-card__action" href={detailHref}>Mở campaign để tải PDF →</a>
          )}
          {item.access === 'PENDING_RELEASE' && (
            <a className="button button--secondary campaign-entitlement-card__action" href={detailHref}>Theo dõi campaign →</a>
          )}
          {item.access === 'DELIVERY_UNAVAILABLE' && (
            <a className="button button--secondary campaign-entitlement-card__action" href={detailHref}>Mở campaign để xem sự cố →</a>
          )}
        </div>
        <details className="campaign-entitlement-details">
          <summary>Chi tiết giao dịch</summary>
          <div className="campaign-entitlement-details__content">
            <p>
              <span className="campaign-entitlement-details__label">Campaign:</span> <code>{item.campaignId}</code><br />
              <span className="campaign-entitlement-details__label">Ví pledge:</span> <code>{item.backerWallet}</code><br />
              <span className="campaign-entitlement-details__label">Transaction:</span> <code>{item.transactionHash}</code>
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}

export function Library({ userId }: { userId: string }) {
  const query = useQuery({ queryKey: ['campaign-campaign-entitlements', userId], queryFn: ({ signal }) => campaignApi.entitlements(signal) });
  const entitlements = query.data ?? [];

  return (
    <section className="campaign-container campaign-library-page">
      <header className="campaign-page-heading">
        <div>
          <span className="campaign-eyebrow">Thư viện ấn phẩm</span>
          <h1>Bộ sưu tập của tôi</h1>
        </div>
        {entitlements.length > 0 && (
          <span className="campaign-page-heading__count">{entitlements.length} khoản hỗ trợ</span>
        )}
      </header>
      {query.isPending && <p role="status" className="muted">Đang kiểm tra quyền lợi của bạn…</p>}
      {query.error && <p role="alert" className="toast toast--error">{userFacingError(getErrorMessage(query.error))}</p>}
      {query.data?.length === 0 && (
        <div className="campaign-empty-state">
          <span className="campaign-eyebrow">Bộ sưu tập đang trống</span>
          <h2>Chưa có tác phẩm nào trong bộ sưu tập</h2>
          <p>Các tác phẩm bạn đã hỗ trợ hoặc sở hữu sẽ xuất hiện tại đây.</p>
          <div className="campaign-empty-state__actions">
            <a className="button button--primary" href="#/campaigns">Khám phá chiến dịch</a>
            <a className="campaign-secondary-link" href="#/campaigns/history/entitlements">Xem quyền lợi Campaign lịch sử</a>
          </div>
          <p className="campaign-empty-state__note">Giao dịch mới có thể cần một khoảng ngắn để được xác nhận và đồng bộ vào bộ sưu tập.</p>
        </div>
      )}
      {entitlements.length > 0 && (
        <>
          <div className="campaign-library-shelf">
            {entitlements.map(item => <EntitlementCard item={item} key={item.id} />)}
          </div>
          <div className="campaign-library-history">
            <span>Bạn từng sử dụng Campaign phiên bản trước?</span>
            <a className="campaign-secondary-link" href="#/campaigns/history/entitlements">Xem quyền lợi Campaign lịch sử</a>
          </div>
        </>
      )}
    </section>
  );
}
