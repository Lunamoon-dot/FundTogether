import { useState } from 'react'
import { createCampaignRevision, getPublication } from '../../lib/api/public-campaigns'
import type { PublicationStatus } from '../../lib/api/public-campaigns'
import { syncSubmission } from '../../lib/api/campaign-submission'
import type { SubmissionPlan } from '../../lib/api/campaign-submission'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignWalletAction } from './CampaignWalletAction'

export function CampaignReviewRecovery({ campaignId, publication, submission, refresh }: {
  campaignId: string; publication: PublicationStatus; submission: { plan: SubmissionPlan; onchainCampaignId: string | null }; refresh: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function revise() {
    setBusy(true); setError('')
    try { const draft = await createCampaignRevision(campaignId)
      window.location.hash = `/organizations/${draft.organizationId}/workspace/campaigns/${draft.id}/edit` }
    catch (cause) { setError(getErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  const review = publication.review
  return <section className="panel"><h3>{review?.decision === 'request_changes' ? 'Resolver yêu cầu chỉnh sửa' : review?.decision === 'reject' ? 'Resolver từ chối hồ sơ' : 'Hủy hoặc chỉnh sửa hồ sơ đã chốt'}</h3>
    {review && review.decision !== 'approve' && <p className="organization-description">{review.reason}</p>}
    <p>Nếu cần sửa hoặc ngừng nộp hồ sơ: hủy campaign chưa công bố để contract trả lại bond trước khi tạo bản nháp mới. Bản mới cần khóa bond và xét duyệt lại.</p>
    {publication.state === 'CANCELLED' ? <button className="button button--primary" disabled={busy} onClick={() => void revise()}>{busy ? 'Đang tạo bản nháp…' : 'Mở bản nháp kế tiếp để chỉnh sửa'}</button>
      : ['DRAFT', 'APPROVED'].includes(publication.state ?? '') && submission.onchainCampaignId !== null && <CampaignWalletAction action="cancel" campaignId={campaignId}
        onchainCampaignId={submission.onchainCampaignId} plan={submission.plan} actor={submission.plan.organizer} projection={publication}
        authorize={async () => {
          const current = await getPublication(campaignId)
          if (current.published || !['DRAFT', 'APPROVED', 'CANCELLED'].includes(current.state ?? ''))
            throw new Error('Quyết định hoặc trạng thái đã thay đổi. Đối chiếu lại trước khi hủy.')
          const fresh = await syncSubmission(campaignId)
          if (fresh.onchainCampaignId === null) throw new Error('Không tìm thấy campaign trên chain.')
          return { plan: fresh.plan, onchainCampaignId: fresh.onchainCampaignId, actor: fresh.plan.organizer }
        }} onRefresh={refresh} />}
    {error && <p role="alert">{error}</p>}
  </section>
}
