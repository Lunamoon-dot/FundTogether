import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCampaignDraft, listOrganizationCampaignDrafts } from '../../lib/api/campaigns'
import type { CampaignDraft, CampaignDraftDetail } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { CampaignWizard } from '../campaigns/CampaignWizard'

export function OrganizationCampaigns({ organizationId, userId, section }: {
  organizationId: string
  userId: string
  section: string
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

  function saved(campaign: CampaignDraftDetail) {
    queryClient.setQueryData<CampaignDraft[]>(listKey, (current = []) => {
      const exists = current.some((item) => item.id === campaign.id)
      return exists ? current.map((item) => item.id === campaign.id ? campaign : item) : [campaign, ...current]
    })
    queryClient.setQueryData(['organization-campaign', userId, organizationId, campaign.id], campaign)
    void queryClient.invalidateQueries({ queryKey: listKey })
    setNotice('Đã lưu campaign và milestones. Campaign chưa được công bố.')
    window.location.hash = `${basePath}/${campaign.id}`
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
          <p className="muted">{campaign.status === 'draft' ? 'Bản nháp — chưa công bố' : campaign.status}</p>
        </section>
        <section className="panel" aria-labelledby="campaign-milestones-title">
          <h2 id="campaign-milestones-title">Milestones ({campaign.milestones.length})</h2>
          {campaign.milestones.length === 0 ? <p>Campaign chưa có milestone.</p> : (
            <ol className="organization-milestones">
              {campaign.milestones.map((milestone) => (
                <li key={milestone.id}>
                  <h3>Milestone {milestone.milestoneIndex + 1}: {milestone.title}</h3>
                  <p className="organization-description">{milestone.description}</p>
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
      {campaigns.isPending ? <p role="status">Đang tải campaign…</p> : campaigns.isError ? (
        <section className="panel"><p role="alert">{getErrorMessage(campaigns.error)}</p>
          <button className="button button--secondary" onClick={() => void campaigns.refetch()}
            disabled={campaigns.isFetching}>Thử lại</button></section>
      ) : campaigns.data.length === 0 ? (
        <section className="panel"><h2>Tổ chức chưa có campaign</h2>
          <p>Tạo campaign đầu tiên để lập kế hoạch và milestones.</p></section>
      ) : (
        <ul className="organization-list">
          {campaigns.data.map((campaign) => (
            <li className="panel" key={campaign.id}>
              <div className="organization-card-heading"><h2>{campaign.title}</h2>
                <span className="organization-role">Bản nháp</span></div>
              <p className="organization-description">{campaign.description}</p>
              <a className="button button--secondary" href={`#${basePath}/${campaign.id}`}
                onClick={() => setNotice('')}>{milestonesPage ? 'Xem milestones' : 'Mở campaign'}</a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
