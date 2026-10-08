import { useQuery } from '@tanstack/react-query'
import { getSubmission, syncSubmission } from '../../lib/api/campaign-submission'
import { getPublicCampaign, getPublication } from '../../lib/api/public-campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignWalletAction } from './CampaignWalletAction'
import { IndexerNotice } from '../explore/PublicCampaigns'
import { CampaignReviewRecovery } from './CampaignReviewRecovery'
import { CampaignMilestoneActivation } from './CampaignMilestoneActivation'
import { CampaignJourney } from './CampaignJourney'
import { campaignStateLabels } from './campaign-journey'

export function CampaignPublication({ campaignId, userId }: { campaignId: string; userId: string }) {
  const submission = useQuery({ queryKey: ['publication-submission', userId, campaignId], queryFn: async () => {
    const plan = await getSubmission(campaignId)
    return plan ? syncSubmission(campaignId) : null
  }, retry: false, refetchInterval: 10_000 })
  const publication = useQuery({ queryKey: ['campaign-publication', userId, campaignId],
    queryFn: ({ signal }) => getPublication(campaignId, signal), retry: false, refetchInterval: 4_000 })
  const publicDetail = useQuery({ queryKey: ['public-campaign', campaignId], enabled: Boolean(!publication.isError && publication.data?.published),
    queryFn: ({ signal }) => getPublicCampaign(campaignId, signal), retry: false, refetchInterval: 10_000 })
  function refresh() { void submission.refetch(); void publication.refetch(); if (publication.data?.published) void publicDetail.refetch() }

  return <section className="panel" aria-labelledby="publication-title">
    <h2 id="publication-title">Resolver duyệt → Organizer công bố</h2>
    {submission.isPending || publication.isPending ? <p role="status">Đang đối chiếu quyền công bố và trạng thái…</p>
      : submission.isError || publication.isError ? <><p role="alert">{getErrorMessage(submission.error ?? publication.error)}</p>
        <button className="button button--secondary" onClick={refresh}>Thử đối chiếu lại</button></>
      : <>
        <IndexerNotice sync={publication.data.sync} />
        <p>Trạng thái đã index: {campaignStateLabels[publication.data.state ?? ''] ?? 'Chưa có dữ liệu'} · block {publication.data.indexedBlock ?? '—'}</p>
        {publication.data.published && (publicDetail.isError ? <p role="alert">Chưa đối chiếu được bước tiếp theo. {getErrorMessage(publicDetail.error)}</p>
          : publicDetail.data ? <CampaignJourney inWorkspace campaign={publicDetail.data.campaign} workflow={publicDetail.data.workflow} sync={publicDetail.data.sync} />
            : <p role="status">Đang đọc hạn xử lý và bước tiếp theo trên chain…</p>)}
        {submission.data && submission.data.onchainCampaignId !== null && !publication.data.published && ['DRAFT', 'APPROVED', 'CANCELLED'].includes(publication.data.state ?? '') &&
          <CampaignReviewRecovery campaignId={campaignId} publication={publication.data} submission={submission.data} refresh={refresh} />}
        {publication.data.review?.decision === 'approve' && <p>Resolver: {publication.data.review.reason}</p>}
        {submission.data?.stage === 'terminated' && <p role="status">Campaign đã kết thúc ({publication.data.state ?? ({ 4: 'FUNDING_FAILED', 5: 'CANCELLED', 12: 'FAILED' } as Record<number, string>)[submission.data.chainState ?? -1] ?? 'TERMINATED'}). Không thể công bố lại.</p>}
        {publication.data.published && publication.data.publicId ? <a className="button button--secondary" href={`#/campaigns/${publication.data.publicId}`}>Mở campaign công khai</a>
          : submission.data?.stage === 'terminated' || (publication.data.review && publication.data.review.decision !== 'approve') ? null
          : submission.data?.onchainCampaignId !== null && submission.data?.onchainCampaignId !== undefined && ['approved', 'published'].includes(submission.data.stage)
            ? <CampaignWalletAction key={`${userId}:${campaignId}`} action="publish" campaignId={campaignId}
              onchainCampaignId={submission.data.onchainCampaignId} plan={submission.data.plan} actor={submission.data.plan.organizer}
              projection={publication.data} authorize={async () => {
                await getPublication(campaignId)
                const fresh = await syncSubmission(campaignId)
                if (fresh.onchainCampaignId === null) throw new Error('Campaign không còn trên chain hiện tại. Tải lại hồ sơ trước khi công bố.')
                return { plan: fresh.plan, onchainCampaignId: fresh.onchainCampaignId, actor: fresh.plan.organizer }
              }} onRefresh={refresh} />
            : publication.data.review?.decision === 'approve' && publication.data.state === 'DRAFT'
              ? <p role="status">Resolver đã đồng ý hồ sơ, nhưng campaign vẫn là DRAFT trên blockchain. Resolver cần liên kết đúng ví resolver và ký giao dịch duyệt. Nút công bố sẽ mở sau khi giao dịch thành công và indexer đã đồng bộ.</p>
              : <p>Khóa đủ bond và chờ resolver duyệt trước khi công bố. Campaign chưa xuất hiện trên feed công khai.</p>}
        {publication.data.published && submission.data?.onchainCampaignId !== null && submission.data?.onchainCampaignId !== undefined
          && ['FUNDED', 'MILESTONE_ACTIVE', 'MILESTONE_SETTLED'].includes(publication.data.state ?? '')
          && <CampaignMilestoneActivation campaignId={campaignId} onchainCampaignId={submission.data.onchainCampaignId}
            plan={submission.data.plan} projection={publication.data} workflow={publicDetail.isError ? undefined : publicDetail.data?.workflow} onRefresh={refresh} />}
      </>}
    <button className="button button--quiet" disabled={submission.isFetching || publication.isFetching} onClick={refresh}>Tải lại tiến trình</button>
  </section>
}
