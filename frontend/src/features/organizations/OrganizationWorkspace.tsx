import { useQuery } from '@tanstack/react-query'
import { listOrganizations } from '../../lib/api/organizations'
import { getErrorMessage } from '../../lib/api/error'
import type { AccountSession } from '../../lib/api/auth'
import { AccountAccess } from '../auth/AccountAccess'
import { OrganizationCampaigns } from './OrganizationCampaigns'
import { OrganizationEvidence } from './OrganizationEvidence'

const sections = [
  { path: '/campaigns', label: 'Campaign' },
  { path: '/milestones', label: 'Milestones' },
  { path: '/evidence', label: 'Bằng chứng' },
]

export function OrganizationWorkspace({
  organizationId, section, session, sessionLoading, onSession,
}: {
  organizationId: string
  section: string
  session: AccountSession | null
  sessionLoading: boolean
  onSession: (session: AccountSession | null) => void
}) {
  const organizations = useQuery({
    queryKey: ['organizations', session?.userId],
    queryFn: listOrganizations,
    enabled: Boolean(session),
    retry: false,
  })
  const organization = organizations.data?.find((item) => item.id === organizationId)
  const activeSection = section || '/campaigns'
  const currentSection = sections.find((item) => item.path === activeSection || activeSection.startsWith(`${item.path}/`))
  const basePath = `/organizations/${organizationId}/workspace`

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <a className="brand" href={`#${basePath}/campaigns`}>
            <span className="brand-mark">F</span><span>FundTogether</span>
          </a>
          <span className="workspace-label">Organization workspace</span>
          {organization && <strong className="organization-workspace-name">{organization.name}</strong>}
        </div>
        {organization && (
          <nav className="dashboard-nav" aria-label="Điều hướng tổ chức">
            {sections.map((item) => (
              <a key={item.path} href={`#${basePath}${item.path}`}
                className={`nav-item${currentSection?.path === item.path ? ' nav-item--active' : ''}`}
                aria-current={currentSection?.path === item.path ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <a className="workspace-explore-link" href={`#/organizations/${organizationId}`}>← Hồ sơ tổ chức</a>
        <a className="workspace-explore-link" href="#/organizations">← Tổ chức của tôi</a>
        <a className="workspace-explore-link" href="#/">← Khu vực người dùng</a>
        <div className="sidebar-account">
          {session && <AccountAccess session={session} onSession={onSession} compact />}
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <span>Organization workspace / <strong>{currentSection?.label ?? 'Không tìm thấy trang'}</strong></span>
        </header>
        <main className="dashboard-content">
          {sessionLoading ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : !session ? (
            <section className="panel">
              <h2>Đăng nhập để mở workspace tổ chức</h2>
              <AccountAccess session={null} onSession={onSession} />
            </section>
          ) : organizations.isPending ? <p role="status">Đang tải tổ chức…</p> : organizations.isError ? (
            <section className="panel">
              <p role="alert">{getErrorMessage(organizations.error)}</p>
              <button className="button button--secondary" disabled={organizations.isFetching}
                onClick={() => void organizations.refetch()}>Thử lại</button>
            </section>
          ) : !organization ? (
            <section className="panel"><h2>Tổ chức không khả dụng</h2>
              <p>Tổ chức không tồn tại hoặc tài khoản này không phải thành viên.</p></section>
          ) : !currentSection ? (
            <section className="panel"><h2>Không tìm thấy trang</h2></section>
          ) : currentSection.path === '/campaigns' || activeSection === '/milestones' ? (
            <OrganizationCampaigns key={`${session.userId}:${organizationId}`}
              organizationId={organizationId} userId={session.userId} section={activeSection} />
          ) : currentSection.path === '/evidence' ? (
            <OrganizationEvidence key={`${session.userId}:${organizationId}`}
              organizationId={organizationId} userId={session.userId} section={activeSection} />
          ) : (
            <section className="panel">
              <h2>{currentSection.label}</h2>
              <p>Mục này sẽ được mở sau khi nối hồ sơ milestone và bằng chứng của từng campaign.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
