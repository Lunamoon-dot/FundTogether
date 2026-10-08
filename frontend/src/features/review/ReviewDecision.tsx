import { useRef, useState } from 'react'
import { authorizeCampaignApproval, saveCampaignReview } from '../../lib/api/public-campaigns'
import type { CampaignReview, ReviewDetail } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignWalletAction } from '../campaigns/CampaignWalletAction'

export function ReviewDecision({ detail, userId, refresh }: { detail: ReviewDetail; userId: string; refresh: () => void }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const reasonLength = reason.trim().length
  const incompleteChecks = detail.checks?.some(check => !check.passed)
  const canDecide = !busy && !detail.conflict && !detail.review && detail.campaign.state === 'DRAFT' && confirmed && reasonLength >= 10 && reasonLength <= 4000
  async function decide(decision: CampaignReview['decision']) {
    if (running.current || !canDecide || (decision === 'approve' && incompleteChecks)) return
    running.current = true
    setBusy(true); setError('')
    try { await saveCampaignReview(detail.campaign.id, { decision, reason: reason.trim(), expectedDossierHash: detail.dossierHash }); refresh() }
    catch (cause) { setError(getErrorMessage(cause)) }
    finally { running.current = false; setBusy(false) }
  }
  const review = detail.review
  return <section className="panel review-decision"><h2>Kiểm tra và quyết định</h2>
    {detail.conflict && <div className="review-notice review-notice--blocked" role="alert">
      <h3>Không thể tự xét duyệt campaign</h3>
      <p>Bạn có liên quan tới campaign này nên không được xét duyệt. Người tạo hồ sơ, thành viên tổ chức và ví đại diện không thể tự duyệt campaign của mình.</p>
      <p>Hồ sơ cần được xử lý bằng tài khoản có quyền RESOLVER, không thuộc tổ chức và không tạo campaign này. Đổi ví trên cùng tài khoản không gỡ điều kiện này.</p>
      <a className="button button--secondary" href="#/account">Quản lý tài khoản</a>
    </div>}
    <h3>Điều kiện xét duyệt</h3>
    <ul className="review-checks">{detail.checks?.map(check => <li key={check.label} className={check.passed ? 'review-check--passed' : 'review-check--failed'}>
      <span className="review-check-icon" aria-hidden="true">{check.passed ? '✓' : '!'}</span><span>{check.label}</span>
      <span className="review-check-result">{check.passed ? 'Đạt' : 'Chưa đạt'}</span>
    </li>)}</ul>
    <p className="muted">Các điều kiện trên chỉ kiểm tra hồ sơ và trạng thái blockchain. Resolver vẫn cần đánh giá hoạt động từ thiện, tính khả thi và tiêu chí hoàn thành.</p>
    {review ? <>
      <h3>{review.decision === 'approve' ? 'Đã ghi nhận ý kiến đồng ý' : review.decision === 'request_changes' ? 'Yêu cầu chỉnh sửa' : 'Từ chối hồ sơ'}</h3>
      <p className="organization-description">{review.reason}</p>
      <p>Tài khoản xử lý: <code>{review.reviewerUserId}</code> · phiên bản {review.revision} · {new Date(review.createdAt).toLocaleString('vi-VN')}</p>
      <p>Ví resolver cấu hình: <code>{review.reviewerWallet}</code>. Lưu ý kiến xét hồ sơ chưa chứng minh tài khoản đã ký bằng ví này.</p>
      <p className="public-wallet-address">Hash hồ sơ: <code>{review.dossierHash}</code> · block đối chiếu {review.checkedBlock}</p>
      {review.decision === 'approve' && !detail.conflict && detail.campaign.state !== 'CANCELLED' && <>
        {detail.campaign.state === 'DRAFT' ? <p>Ý kiến đồng ý đã được lưu. Bước tiếp theo là ký giao dịch duyệt bằng ví resolver và chờ indexer xác nhận.</p>
          : <p role="status">Trạng thái đã ghi trên chain: {detail.campaign.state}.</p>}
        {detail.campaign.state === 'DRAFT' && !detail.canSign ? <div className="review-notice review-notice--blocked" role="status">
          <h3>Cần liên kết ví resolver để mở nút ký duyệt</h3>
          <p>Đăng nhập tài khoản resolver hiện tại, mở Tài khoản và ký thông điệp “Liên kết ví ngoài” bằng <code>{detail.resolver}</code>. Ví hiển thị trong MetaMask cần được kết nối với trang và liên kết bằng chữ ký SIWE.</p>
          <p>Việc liên kết ví không tốn gas. Sau đó quay lại hồ sơ này; nút “Duyệt campaign bằng ví resolver” sẽ xuất hiện.</p>
          <a className="button button--primary" href="#/account">Mở Tài khoản để liên kết ví</a>{' '}
          <button type="button" className="button button--secondary" onClick={refresh}>Đã liên kết? Kiểm tra lại</button>
        </div>
        : <CampaignWalletAction key={`${userId}:${detail.campaign.id}`} action="approve" campaignId={detail.campaign.id}
          onchainCampaignId={detail.campaign.onchainCampaignId} plan={detail.campaign.plan} actor={detail.resolver} projection={detail.campaign}
          authorize={async () => { const fresh = await authorizeCampaignApproval(detail.campaign.id)
            return { plan: fresh.campaign.plan, onchainCampaignId: fresh.campaign.onchainCampaignId, actor: fresh.resolver } }} onRefresh={refresh} />}
      </>}
      {review.decision !== 'approve' && <p>Organizer sẽ thấy lý do, hủy campaign chưa công bố để nhận lại bond, rồi tạo bản nháp mới nếu cần nộp lại.</p>}
    </> : detail.campaign.state === 'DRAFT' && !detail.conflict && <div className="review-form">
      <h3>Ghi nhận quyết định</h3>
      {incompleteChecks && <p className="review-notice review-notice--blocked" role="status">Chưa đủ điều kiện đồng ý hồ sơ. Bạn vẫn có thể yêu cầu sửa hoặc từ chối sau khi ghi lý do và xác nhận đã đọc.</p>}
      <label htmlFor="review-reason">Nhận xét và lý do (10–4000 ký tự)</label>
      <textarea id="review-reason" className="review-reason" rows={4} maxLength={4000} aria-describedby="review-reason-help" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
      <p id="review-reason-help" className="muted review-field-help">{reasonLength < 10 ? `Cần thêm ${10 - reasonLength} ký tự để ghi nhận lý do.` : `${reasonLength}/4000 ký tự.`}</p>
      <label className="review-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>Tôi đã đọc hồ sơ, ngân sách, tính khả thi và tiêu chí hoàn thành.</span></label>
      <p className="review-field-help" role="status">{busy ? 'Đang lưu quyết định…' : !confirmed ? 'Xác nhận đã đọc hồ sơ để mở các nút quyết định.' : reasonLength < 10 ? 'Nhập lý do có ít nhất 10 ký tự để tiếp tục.' : 'Đã đủ thông tin. Chọn quyết định bên dưới.'}</p>
      <div className="review-buttons">
        {(['approve', 'request_changes', 'reject'] as const).map(decision => <button key={decision} className={decision === 'approve' ? 'button button--primary' : 'button button--secondary'}
          disabled={!canDecide || (decision === 'approve' && incompleteChecks)}
          onClick={() => void decide(decision)}>{decision === 'approve' ? 'Đồng ý hồ sơ' : decision === 'request_changes' ? 'Yêu cầu sửa' : 'Từ chối'}</button>)}
      </div><p className="muted">Quyết định được lưu cố định cho hồ sơ này. Hồ sơ chỉnh sửa sẽ có lần xét duyệt riêng.</p>
    </div>}
    {error && <p className="review-notice review-notice--blocked" role="alert">{error}</p>}
  </section>
}
