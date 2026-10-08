import { useQuery } from '@tanstack/react-query'
import { listOrganizations } from '../../lib/api/organizations'
import { listOrganizationCampaignDrafts } from '../../lib/api/campaigns'
import { getErrorMessage } from '../../lib/api/error'
import { OrganizationCampaignEntry } from './OrganizationCampaignEntry'

function OrganizationCampaignLinks({ organizationId, name, userId }: { organizationId: string; name: string; userId: string }) {
  const campaigns = useQuery({ queryKey: ['organization-campaigns', userId, organizationId],
    queryFn: () => listOrganizationCampaignDrafts(organizationId), retry: false })
  const basePath = `/organizations/${organizationId}/workspace/campaigns`
  return <div>
    <h3>Campaign của {name}</h3>
    {campaigns.isPending ? <p role="status">Đang tải campaign…</p>
      : campaigns.isError ? <p role="alert">{getErrorMessage(campaigns.error)}</p>
        : campaigns.data.filter(campaign => campaign.status !== 'draft').length === 0
          ? <p className="muted">Chưa có campaign nào đã nộp.</p>
          : <ul className="organization-list">{campaigns.data.filter(campaign => campaign.status !== 'draft').map(campaign =>
            <OrganizationCampaignEntry key={campaign.id} campaign={campaign} userId={userId} basePath={basePath} />)}</ul>}
    <a className="button button--secondary organization-workspace-link" href={`#${basePath}`}>Xem tất cả campaign của {name}</a>
  </div>
}

export function OrganizationWorkspaceLinks({ userId }: { userId: string }) {
  const organizations = useQuery({ queryKey: ['organizations', userId], queryFn: listOrganizations, retry: false })
  return <section className="panel workspace-organization-links" aria-labelledby="organization-campaign-links-title">
    <h2 id="organization-campaign-links-title">Campaign của tổ chức</h2>
    <p className="muted">Campaign đã nộp nằm trong tổ chức. Campaign được duyệt cần ví đại diện tổ chức ký công bố trước khi xuất hiện trên feed.</p>
    {organizations.isPending ? <p role="status">Đang tải tổ chức của bạn…</p>
      : organizations.isError ? <><p role="alert">{getErrorMessage(organizations.error)}</p>
        <button className="button button--secondary" disabled={organizations.isFetching} onClick={() => void organizations.refetch()}>Tải lại tổ chức</button></>
      : organizations.data.length > 0 ? <div>{organizations.data.map(organization =>
        <OrganizationCampaignLinks key={organization.id} organizationId={organization.id} name={organization.name} userId={userId} />)}</div>
      : <a className="button button--secondary organization-workspace-link" href="#/organizations">Mở tổ chức của tôi</a>}
  </section>
}
