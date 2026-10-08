import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCampaignDraft, listCampaignDrafts, listOrganizationCampaignDrafts } from '../../lib/api/campaigns'
import { getPublication } from '../../lib/api/public-campaigns'
import type { CampaignDraft, CampaignDraftDetail } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignSubmission } from '../campaigns/CampaignSubmission'
import { CampaignPublication } from '../campaigns/CampaignPublication'
import { formatUnits } from 'viem'
import { CampaignWizard } from '../campaigns/CampaignWizard'
import { OrganizationCampaignEntry } from './OrganizationCampaignEntry'
import { DeleteCampaignDraft } from '../campaigns/DeleteCampaignDraft'

export function OrganizationCampaigns({ organizationId, userId, section, unassignedDrafts }: {
  organizationId: string
  userId: string
  section: string
  unassignedDrafts?: ReactNode
}) {
  const [notice, setNotice] = useState('')
  const basePath = `/organizations/${organizationId}/workspace/campaigns`
  const creating = section === '/campaigns/new'
  const milestonesPage = section === '/milestones'
  const detailRoute = creating ? null : /^\/campaigns\/([^/]+)(\/edit)?$/.exec(section)
  const campaignId = detailRoute?.[1]
  const editing = Boolean(detailRoute?.[2])
  const queryClient = useQueryClient()
  const listKey = ['organization-campaigns', userId, organizationId]
  const detailKey = ['organization-campaign', userId, organizationId, campaignId]
  const campaigns = useQuery({
    queryKey: listKey,
    queryFn: () => listOrganizationCampaignDrafts(organizationId),
    enabled: !creating && !campaignId,
    retry: false,
  })
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: async ({ signal }) => {
      const campaign = await getCampaignDraft(campaignId!, signal)
      if (campaign.organizationId !== organizationId) {
        throw new Error('Campaign không thuộc tổ chức đang mở.')
      }
      return campaign
    },
    enabled: Boolean(campaignId),
    refetchOnWindowFocus: !editing,
    retry: false,
  })
  const unassigned = useQuery({
    queryKey: ['campaigns', userId], queryFn: listCampaignDrafts,
    enabled: Boolean(unassignedDrafts) && !creating && !campaignId && !milestonesPage, retry: false,
  })
  const submitted = (campaigns.data ?? []).filter((campaign) => campaign.status !== 'draft')
  const publications = useQueries({ queries: submitted.map((campaign) => ({
    queryKey: ['campaign-publication', userId, campaign.id],
    queryFn: ({ signal }: { signal: AbortSignal }) => getPublication(campaign.id, signal),
    enabled: !creating && !campaignId && !milestonesPage,
    retry: false, refetchInterval: 10_000,
  })) })
  const publicIds = new Set(submitted.filter((_, index) => publications[index].data?.published).map((campaign) => campaign.id))
  const groups = [
    { id: 'drafts', title: 'Bản nháp', items: (campaigns.data ?? []).filter((campaign) => campaign.status === 'draft'),
      description: 'Hồ sơ còn có thể chỉnh sửa; chỉ bản nháp đủ điều kiện mới có nút xóa.' },
    { id: 'frozen', title: 'Đã chốt hồ sơ', items: submitted.filter((campaign) => !publicIds.has(campaign.id)),
      description: 'Hồ sơ đã khóa nội dung, chưa được xác nhận công khai. Mở campaign để tiếp tục nộp, xét duyệt hoặc công bố.' },
    { id: 'public', title: 'Đang công khai', items: submitted.filter((campaign) => publicIds.has(campaign.id)),
      description: 'Campaign đã được xác nhận công bố qua dữ liệu blockchain đã đồng bộ.' },
  ]

  function saved(campaign: CampaignDraftDetail) {
    queryClient.setQueryData<CampaignDraft[]>(listKey, (current = []) => {
      const exists = current.some((item) => item.id === campaign.id)
      return exists ? current.map((item) => item.id === campaign.id ? campaign : item) : [campaign, ...current]
    })
    queryClient.setQueryData(['organization-campaign', userId, organizationId, campaign.id], campaign)
    void queryClient.invalidateQueries({ queryKey: listKey })
    setNotice(campaign.status === 'awaiting_review' ? 'Bond đã khóa. Campaign chờ resolver duyệt.' : 'Đã lưu campaign và milestones. Campaign chưa được công bố.')
    window.location.hash = `${basePath}/${campaign.id}`
  }

  function deleted() {
    setNotice('Đã xóa bản nháp khỏi workspace. Dữ liệu và file gốc được giữ trong hệ thống.')
    window.location.hash = basePath
  }

  if (creating) return (
    <CampaignWizard key="new" organizationId={organizationId}
      onClose={() => { window.location.hash = basePath }} onSaved={saved} />
  )

  if (campaignId) {
    if (detail.isPending) return <p role="status">Đang tải campaign…</p>
    if (detail.isError) return (
      <section className="panel">
        <p role="alert">{getErrorMessage(detail.error)}</p>
        <button className="button button--secondary" disabled={detail.isFetching}
          onClick={() => void detail.refetch()}>Thử lại</button>
        <a className="public-back" href={`#${basePath}`}>← Danh sách campaign</a>
      </section>
    )
    const campaign = detail.data
    if (editing && campaign.status !== 'draft') return (
      <section className="panel"><p>Campaign đã chốt để nộp. Không thể sửa nội dung hoặc ngân sách.</p>
        <a className="button button--secondary" href={`#${basePath}/${campaign.id}`}>Mở tiến trình nộp</a></section>
    )
    if (editing) return (
      <CampaignWizard key={campaign.id} initialCampaign={campaign} organizationId={organizationId}
        onClose={() => { window.location.hash = `${basePath}/${campaign.id}` }} onSaved={saved} />
    )
    return (
      <>
        <a className="public-back" href={`#${basePath}`} onClick={() => setNotice('')}>← Danh sách campaign</a>
        {notice && <p className="toast toast--success" role="status">{notice}</p>}
        <section className="panel">
          <div className="organization-card-heading">
            <h1>{campaign.title}</h1>
            {campaign.status === 'draft' && (
              <a className="button button--primary" href={`#${basePath}/${campaign.id}/edit`}
                onClick={() => setNotice('')}>Sửa campaign</a>
            )}
          </div>
          <p className="organization-description">{campaign.description}</p>
          <p className="muted">{campaign.status === 'draft' ? 'Bản nháp — chưa công bố' : 'Trạng thái on-chain và bước công bố được đối chiếu bên dưới.'}</p>
          <DeleteCampaignDraft key={`${userId}:${campaign.id}`} campaign={campaign} userId={userId} onDeleted={deleted} />
        </section>
        <CampaignSubmission key={campaign.id} campaign={campaign} onComplete={() => { void detail.refetch(); void queryClient.invalidateQueries({ queryKey: listKey }) }} />
        {campaign.status !== 'draft' && <CampaignPublication key={`${userId}:${campaign.id}`} campaignId={campaign.id} userId={userId} />}
        <section className="panel" aria-labelledby="campaign-milestones-title">
          <h2 id="campaign-milestones-title">Milestones ({campaign.milestones.length})</h2>
          {campaign.milestones.length === 0 ? <p>Campaign chưa có milestone.</p> : (
            <ol className="organization-milestones">
              {campaign.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <h3>Milestone {milestone.milestoneIndex + 1}: {milestone.title}</h3>
                  <p className="organization-description">{milestone.description}</p>
                  <p>Ngân sách: {milestone.budgetUnits ? `${formatUnits(BigInt(milestone.budgetUnits), 6)} USDC` : 'Chưa nhập'}</p>
                  <h4>Tiêu chí hoàn thành</h4>
                  <ul>{milestone.acceptanceCriteria.map((criterion) => (
                    <li key={criterion.criterionId}>{criterion.description}</li>
                  ))}</ul>
                  <a className="button button--secondary"
                    href={`#/organizations/${organizationId}/workspace/evidence/${campaign.id}/milestones/${milestone.id}`}>
                    Mở hồ sơ bằng chứng
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </>
    )
  }

  if (section !== '/campaigns' && !milestonesPage) {
    return <section className="panel"><h2>Không tìm thấy trang</h2></section>
  }

  return (
    <>
      <div className="feed-heading">
        <h1>{milestonesPage ? 'Milestones theo campaign' : 'Campaign'}</h1>
        {!milestonesPage && <a className="button button--primary" href={`#${basePath}/new`}
          onClick={() => setNotice('')}>+ Tạo campaign</a>}
      </div>
      {milestonesPage && <p className="muted">Chọn campaign để xem milestones và tiêu chí hoàn thành.</p>}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}
      {campaigns.isPending ? <p role="status">Đang tải campaign…</p> : campaigns.isError ? (
        <section className="panel"><p role="alert">{getErrorMessage(campaigns.error)}</p>
          <button className="button button--secondary" onClick={() => void campaigns.refetch()}
            disabled={campaigns.isFetching}>Thử lại</button></section>
      ) : milestonesPage && campaigns.data.length === 0 ? (
        <section className="panel"><h2>Tổ chức chưa có campaign</h2>
          <p>Tạo campaign đầu tiên để lập kế hoạch và milestones.</p></section>
      ) : milestonesPage ? (
        <ul className="organization-list">
          {campaigns.data.map((campaign) => <OrganizationCampaignEntry key={campaign.id}
            campaign={campaign} userId={userId} basePath={basePath} milestonesPage={milestonesPage} onDeleted={deleted} />)}
        </ul>
      ) : (
        <>
          {publications.some((item) => item.isPending) && <p className="muted" role="status">Đang đối chiếu trạng thái công bố để phân loại campaign…</p>}
          {publications.some((item) => item.isError) && <p role="alert">Chưa đối chiếu được trạng thái công bố của một số campaign. Xem lỗi ở từng hồ sơ và thử lại.</p>}
          {groups.map((group) => <section className="campaign-group" key={group.id} aria-labelledby={`campaign-group-${group.id}`}>
            <div className="organization-card-heading"><h2 id={`campaign-group-${group.id}`}>{group.title}</h2>
              <span className="organization-role">{group.items.length + (group.id === 'drafts' && unassignedDrafts ? unassigned.data?.length ?? 0 : 0)}</span></div>
            <p className="muted">{group.description}</p>
            {group.items.length ? <ul className="organization-list">{group.items.map((campaign) => <OrganizationCampaignEntry key={campaign.id}
              campaign={campaign} userId={userId} basePath={basePath} onDeleted={deleted} />)}</ul>
              : <p className="campaign-group-empty">{group.id === 'drafts' && unassignedDrafts ? 'Tổ chức chưa có bản nháp.' : `Chưa có campaign trong mục “${group.title}”.`}</p>}
            {group.id === 'drafts' && unassignedDrafts}
          </section>)}
        </>
      )}
    </>
  )
}
