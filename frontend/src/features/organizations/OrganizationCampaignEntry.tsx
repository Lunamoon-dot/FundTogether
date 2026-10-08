import { useQuery } from '@tanstack/react-query'
import type { CampaignDraft } from '../../lib/api/campaigns'
import { getPublication } from '../../lib/api/public-campaigns'
import { DeleteCampaignDraft } from '../campaigns/DeleteCampaignDraft'

export function OrganizationCampaignEntry({ campaign, userId, basePath, milestonesPage = false, onDeleted }: {
  campaign: CampaignDraft
  userId: string
  basePath: string
  milestonesPage?: boolean
  onDeleted?: (id: string) => void
}) {
  const publication = useQuery({
    queryKey: ['campaign-publication', userId, campaign.id],
    queryFn: ({ signal }) => getPublication(campaign.id, signal),
    enabled: campaign.status !== 'draft',
    retry: false,
    refetchInterval: 10_000,
  })
  const state = publication.data
  const approved = state?.state === 'APPROVED' && !state.published
  const label = campaign.status === 'draft' ? 'Bản nháp'
    : publication.isError ? 'Chưa kiểm tra được trạng thái'
      : publication.isPending ? 'Đang đối chiếu trạng thái…'
        : state?.published ? 'Đã công bố'
          : approved ? 'Đã duyệt · chờ công bố'
            : state?.state === 'DRAFT' ? 'Chờ resolver duyệt'
              : state?.state ?? (campaign.status === 'submission_prepared' ? 'Đã chốt hồ sơ · chưa hoàn tất nộp' : 'Chưa tạo trên chain')

  return <li className="panel">
    <div className="organization-card-heading"><h2>{campaign.title}</h2>
      <span className="organization-role">{label}</span></div>
    <p className="organization-description">{campaign.description}</p>
    <a className="button button--secondary" href={`#${basePath}/${campaign.id}`}>
      {milestonesPage ? 'Xem milestones' : approved ? 'Mở để công bố' : 'Mở campaign'}
    </a>
    {state?.published && state.publicId && <a className="button button--secondary" href={`#/campaigns/${state.publicId}`}>Xem trang công khai</a>}
    {publication.isError && <button className="button button--quiet" onClick={() => void publication.refetch()}>Thử đối chiếu lại</button>}
    {!milestonesPage && onDeleted && <DeleteCampaignDraft campaign={campaign} userId={userId} onDeleted={onDeleted} />}
  </li>
}
