import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCampaignDraft, listCampaignDrafts } from '../../lib/api/campaigns'
import type { CampaignDraft, CampaignDraftDetail } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignWizard } from './CampaignWizard'
import { DeleteCampaignDraft } from './DeleteCampaignDraft'
import { formatUnits } from 'viem'

// Existing personal drafts stay accessible without creating a second workspace.
export function UnassignedCampaignDrafts({ userId, campaignId, editing = false, onDeleted, basePath }: {
  userId: string
  campaignId?: string
  editing?: boolean
  onDeleted: (message: string) => void
  basePath: string
}) {
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()
  const listKey = ['campaigns', userId]
  const detailKey = ['campaigns', userId, campaignId]
  const list = useQuery({ queryKey: listKey, queryFn: listCampaignDrafts, enabled: !campaignId, retry: false })
  const detail = useQuery({ queryKey: detailKey, enabled: Boolean(campaignId), retry: false,
    refetchOnWindowFocus: !editing,
    queryFn: async ({ signal }) => {
      const campaign = await getCampaignDraft(campaignId!, signal)
      if (campaign.organizationId) throw new Error('Campaign đã thuộc tổ chức. Mở trong danh sách của tổ chức đó.')
      return campaign
    },
  })

  function saved(campaign: CampaignDraftDetail) {
    queryClient.setQueryData<CampaignDraft[]>(listKey, (items = []) => items.map((item) => item.id === campaign.id ? campaign : item))
    queryClient.setQueryData(['campaigns', userId, campaign.id], campaign)
    void queryClient.invalidateQueries({ queryKey: listKey, exact: true })
    setNotice('Đã lưu bản nháp.')
    window.location.hash = `${basePath}/drafts/${campaign.id}`
  }

  function deleted() {
    onDeleted('Đã xóa bản nháp khỏi workspace. Dữ liệu và file gốc được giữ trong hệ thống.')
    window.location.hash = `${basePath}/campaigns`
  }

  if (!campaignId) return <section className="panel" aria-labelledby="unassigned-drafts-title">
    <h2 id="unassigned-drafts-title">Bản nháp chưa gắn tổ chức</h2>
    <p className="muted">Bản nháp cá nhân đã lưu trước đây nằm ở đây. Tạo campaign mới trong tổ chức đã chọn ở trên.</p>
    {notice && <p className="toast toast--success" role="status">{notice}</p>}
    {list.isPending ? <p role="status">Đang tải bản nháp…</p> : list.isError ? <>
      <p role="alert">{getErrorMessage(list.error)}</p>
      <button className="button button--secondary" disabled={list.isFetching} onClick={() => void list.refetch()}>Tải lại bản nháp</button>
    </> : list.data.length === 0 ? <p>Không có bản nháp chưa gắn tổ chức.</p> : (
      <ul className="organization-list">{list.data.map((campaign) => <li key={campaign.id}>
        <div className="organization-card-heading"><h3>{campaign.title}</h3><span className="organization-role">Bản nháp</span></div>
        <p className="organization-description">{campaign.description}</p>
        <a className="button button--secondary" href={`#${basePath}/drafts/${campaign.id}`}>Mở bản nháp</a>
        <DeleteCampaignDraft campaign={campaign} userId={userId} onDeleted={deleted} />
      </li>)}</ul>
    )}
  </section>

  if (detail.isPending) return <p role="status">Đang tải bản nháp…</p>
  if (detail.isError) return <section className="panel">
    <p role="alert">{getErrorMessage(detail.error)}</p>
    <button className="button button--secondary" disabled={detail.isFetching} onClick={() => void detail.refetch()}>Thử lại</button>
    <a className="public-back" href={`#${basePath}/campaigns`}>← Danh sách campaign</a>
  </section>
  const campaign = detail.data
  if (editing && campaign.status === 'draft') return <CampaignWizard key={campaign.id} initialCampaign={campaign}
    onClose={() => { window.location.hash = `${basePath}/drafts/${campaign.id}` }} onSaved={saved} />
  return <>
    <a className="public-back" href={`#${basePath}/campaigns`}>← Danh sách campaign</a>
    {notice && <p className="toast toast--success" role="status">{notice}</p>}
    <section className="panel">
      <div className="organization-card-heading"><h1>{campaign.title}</h1>
        {campaign.status === 'draft' && <a className="button button--secondary" href={`#${basePath}/drafts/${campaign.id}/edit`}>Sửa bản nháp</a>}
      </div>
      <p className="organization-description">{campaign.description}</p>
      <p className="muted">Hồ sơ chưa gắn tổ chức. Trong bước nộp của trình chỉnh sửa, chọn tổ chức để tạo hồ sơ tổ chức từ nội dung này; bản nháp gốc được giữ lại.</p>
      <DeleteCampaignDraft campaign={campaign} userId={userId} onDeleted={deleted} />
    </section>
    <section className="panel"><h2>Milestones ({campaign.milestones.length})</h2>
      <ol className="organization-milestones">{campaign.milestones.map((milestone) => <li key={milestone.id}>
        <h3>{milestone.title}</h3><p className="organization-description">{milestone.description}</p>
        <p>Ngân sách: {milestone.budgetUnits ? `${formatUnits(BigInt(milestone.budgetUnits), 6)} USDC` : 'Chưa nhập'}</p>
        <ul>{milestone.acceptanceCriteria.map((criterion) => <li key={criterion.criterionId}>{criterion.description}</li>)}</ul>
      </li>)}</ol>
    </section>
  </>
}
