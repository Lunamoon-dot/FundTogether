import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import { getCampaignDraft, listOrganizationCampaignDrafts } from '../../lib/api/campaigns'
import { getEvidenceDraft } from '../../lib/api/evidence-drafts'
import { getErrorMessage } from '../../lib/api/error'
import { EvidenceDraftEditor } from './EvidenceDraftEditor'

export function OrganizationEvidence({ organizationId, userId, section }: {
  organizationId: string
  userId: string
  section: string
}) {
  const basePath = `/organizations/${organizationId}/workspace/evidence`
  const route = /^\/evidence\/([^/]+)(?:\/milestones\/([^/]+))?$/.exec(section)
  const campaignId = route?.[1]
  const milestoneId = route?.[2]
  const campaigns = useQuery({
    queryKey: ['organization-campaigns', userId, organizationId],
    queryFn: () => listOrganizationCampaignDrafts(organizationId),
    enabled: section === '/evidence',
    retry: false,
  })
  const campaign = useQuery({
    queryKey: ['organization-campaign', userId, organizationId, campaignId],
    queryFn: async ({ signal }) => {
      const result = await getCampaignDraft(campaignId!, signal)
      if (result.organizationId !== organizationId) throw new Error('Campaign không thuộc tổ chức đang mở.')
      return result
    },
    enabled: Boolean(campaignId),
    refetchOnWindowFocus: false,
    retry: false,
  })
  const milestone = campaign.data?.milestones.find((item) => item.id === milestoneId)
  const draftKey = ['organization-evidence', userId, organizationId, campaignId, milestoneId]
  const draft = useQuery({
    queryKey: draftKey,
    queryFn: async ({ signal }) => {
      try {
        return await getEvidenceDraft(campaignId!, String(milestone!.milestoneIndex), signal)
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404 &&
          error.response.data?.message === 'Evidence draft not found') return null
        throw error
      }
    },
    enabled: Boolean(milestone),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })

  if (section !== '/evidence' && !route) return <section className="panel"><h2>Không tìm thấy trang</h2></section>
  if (!campaignId) return (
    <>
      <div className="feed-heading"><h1>Bằng chứng</h1></div>
      <p className="muted">Chọn campaign, sau đó chọn milestone cần chuẩn bị hồ sơ.</p>
      {campaigns.isPending ? <p role="status">Đang tải campaign…</p> : campaigns.isError ? (
        <section className="panel"><p role="alert">{getErrorMessage(campaigns.error)}</p>
          <button className="button button--secondary" disabled={campaigns.isFetching}
            onClick={() => void campaigns.refetch()}>Thử lại</button></section>
      ) : campaigns.data.length === 0 ? <section className="panel"><p>Tổ chức chưa có campaign.</p>
        <a href={`#/organizations/${organizationId}/workspace/campaigns`}>Mở danh sách campaign</a></section> : (
        <ul className="organization-list">{campaigns.data.map((item) => (
          <li className="panel" key={item.id}><h2>{item.title}</h2>
            <p className="organization-description">{item.description}</p>
            <a className="button button--secondary" href={`#${basePath}/${item.id}`}>Chọn milestone</a></li>
        ))}</ul>
      )}
    </>
  )
  if (campaign.isPending) return <p role="status">Đang tải campaign…</p>
  if (campaign.isError) return <section className="panel"><p role="alert">{getErrorMessage(campaign.error)}</p>
    <button className="button button--secondary" disabled={campaign.isFetching}
      onClick={() => void campaign.refetch()}>Thử lại</button></section>
  if (!milestoneId) return (
    <>
      <a className="public-back" href={`#${basePath}`}>← Chọn campaign khác</a>
      <div className="feed-heading"><h1>{campaign.data.title}</h1></div>
      <ul className="organization-list">{campaign.data.milestones.map((item) => (
        <li className="panel" key={item.id}><h2>Milestone {item.milestoneIndex + 1}: {item.title}</h2>
          <p className="organization-description">{item.description}</p>
          <a className="button button--secondary" href={`#${basePath}/${campaignId}/milestones/${item.id}`}>Mở hồ sơ bằng chứng</a></li>
      ))}</ul>
      {campaign.data.milestones.length === 0 && <p>Campaign chưa có milestone.</p>}
    </>
  )
  if (!milestone) return <section className="panel"><h2>Milestone không tồn tại trong campaign này</h2>
    <a href={`#${basePath}/${campaignId}`}>Chọn lại milestone</a></section>
  return (
    <>
      <a className="public-back" href={`#${basePath}/${campaignId}`}>← Milestones của {campaign.data.title}</a>
      {draft.isPending ? <p role="status">Đang tải hồ sơ…</p> : draft.isError ? (
        <section className="panel"><p role="alert">{getErrorMessage(draft.error)}</p>
          <button className="button button--secondary" disabled={draft.isFetching}
            onClick={() => void draft.refetch()}>Thử lại</button></section>
      ) : <EvidenceDraftEditor key={`${milestone.id}:${draft.data?.revision ?? 'new'}`}
        organizationId={organizationId} campaignId={campaignId} milestone={milestone} initialDraft={draft.data}
        draftKey={draftKey} />}
    </>
  )
}
