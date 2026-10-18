import { useState } from 'react';
import { openCommunityReview as openCampaignCommunityReview, reviewCampaign } from '../api/campaigns';
import type { Campaign } from '../api/campaigns';
import { getErrorMessage } from '../../../lib/api/error';
import { FrozenTerms } from '../shared/FrozenTerms';

function resolverStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UNDER_REVIEW_PRIVATE: 'Đang kiểm tra riêng',
    COMMUNITY_REVIEW: 'Chờ Resolver quyết định',
    APPROVED: 'Đã duyệt · chờ kích hoạt',
    CHANGES_REQUESTED: 'Cần Creator bổ sung',
    REJECTED: 'Đã từ chối',
    STOPPED: 'Đã dừng',
  };
  return labels[status] ?? status;
}

export function ResolverReview({ campaign, onChange }: { campaign: Campaign; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openCommunityReview() {
    setBusy(true); setError('');
    try { await openCampaignCommunityReview(campaign.id); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function decide(outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED') {
    if (!campaign.commitmentHash) return;
    setBusy(true); setError('');
    try { await reviewCampaign(campaign.id, { outcome, decisionReason: reason, commitmentHash: campaign.commitmentHash }); onChange(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className="resolver-review-card" aria-labelledby={`resolver-review-${campaign.id}`}>
    <header className="resolver-review-card__header">
      <div>
        <span className="resolver-section-kicker">Hồ sơ cần xử lý</span>
        <h3 id={`resolver-review-${campaign.id}`}>{campaign.title}</h3>
      </div>
      <span className="resolver-status-pill">{resolverStatusLabel(campaign.status)}</span>
    </header>

    <div className="resolver-review-card__terms"><FrozenTerms campaign={campaign} /></div>

    {campaign.reviews?.length ? <details className="resolver-history"><summary>Lịch sử thẩm định ({campaign.reviews.length})</summary>{campaign.reviews.map(review => <p key={review.id}><strong>{review.outcome}</strong> · {review.decisionReason}</p>)}</details> : <p className="muted">Chưa có quyết định nào cho bản cam kết hiện tại.</p>}

    {error && <p role="alert" className="resolver-inline-error">{error}</p>}

    {campaign.status === 'UNDER_REVIEW_PRIVATE' && (
      <div className="resolver-next-action resolver-next-action--bottom">
        <div className="resolver-next-action__text">
          <strong>Hành động của Resolver:</strong>
          <p>Hồ sơ đã được kiểm tra riêng. Mở community review khi cam kết này sẵn sàng nhận góp ý.</p>
        </div>
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => void openCommunityReview()}
        >
          {busy ? 'Đang mở…' : 'Mở community review'}
        </button>
      </div>
    )}

    {campaign.status === 'COMMUNITY_REVIEW' && (
      <fieldset className="resolver-decision-panel" disabled={busy}>
        <legend>Quyết định Resolver</legend>
        <p className="resolver-decision-panel__intro">Phản hồi cộng đồng chỉ mang tính tham khảo. Quyết định dưới đây là hành động chính của Resolver.</p>
        <label className="field">Nhận xét thẩm định (10–2000 ký tự)<textarea minLength={10} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <div className="resolver-decision-actions">
          <button className="button button--primary" disabled={reason.trim().length < 10} onClick={() => void decide('APPROVED')}>Duyệt hồ sơ PDF</button>
          <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('CHANGES_REQUESTED')}>Yêu cầu Creator bổ sung</button>
          <button className="button button--secondary" disabled={reason.trim().length < 10} onClick={() => void decide('REJECTED')}>Từ chối hồ sơ</button>
        </div>
      </fieldset>
    )}
  </section>;
}
