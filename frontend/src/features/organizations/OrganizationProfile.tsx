import { useQuery } from '@tanstack/react-query'
import { listOrganizations } from '../../lib/api/organizations'
import { getErrorMessage } from '../../lib/api/error'
import { OrganizationWallet } from './OrganizationWallet'
import { organizationVerificationLabel } from './organization-verification'
import { HedOrganizationVerification } from './HedOrganizationVerification'

export function OrganizationProfile({ organizationId, userId }: { organizationId: string; userId: string }) {
  const organizations = useQuery({
    queryKey: ['organizations', userId], queryFn: listOrganizations, retry: false,
  })
  const organization = organizations.data?.find((item) => item.id === organizationId)
  if (organizations.isPending) return <p role="status">Đang tải hồ sơ tổ chức…</p>
  if (organizations.isError) return (
    <section className="panel"><p role="alert">{getErrorMessage(organizations.error)}</p>
      <button className="button button--secondary" onClick={() => void organizations.refetch()}
        disabled={organizations.isFetching}>Thử lại</button></section>
  )
  if (!organization) return <section className="panel"><h1>Tổ chức không khả dụng</h1></section>
  return (
    <div className="organizations-page">
      <div className="feed-heading"><h1>Hồ sơ tổ chức</h1></div>
      <section className="panel">
        <div className="organization-card-heading"><h2>{organization.name}</h2>
          <span className="organization-role">Chủ sở hữu</span></div>
        <p className="organization-description">{organization.description}</p>
        <div className="organization-card-meta"><span>{organizationVerificationLabel(organization.verificationStatus)}</span>
          <span>Tạo ngày {new Intl.DateTimeFormat('vi-VN').format(new Date(organization.createdAt))}</span></div>
      </section>
      <OrganizationWallet key={`${userId}:${organization.id}`} organization={organization} userId={userId} />
      <HedOrganizationVerification organization={organization} />
    </div>
  )
}
