import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listOrganizations } from '../../lib/api/organizations'
import { getErrorMessage } from '../../lib/api/error'
import type { AccountSession } from '../../lib/api/auth'
import { AccountAccess } from '../auth/AccountAccess'
import { UnassignedCampaignDrafts } from '../campaigns/UnassignedCampaignDrafts'
import { OrganizationCampaigns } from './OrganizationCampaigns'
import { OrganizationEvidence } from './OrganizationEvidence'
import { OrganizationsPage } from './OrganizationsPage'
import { OrganizationProfile } from './OrganizationProfile'
import { organizationSwitchPath } from './organization-navigation'
import './OrganizationsPage.css'
import { isAdvance } from '../../lib/web3/deployment-context'
import { AdvanceOrganizationCampaigns } from '../campaigns/advance/AdvanceOrganizationCampaigns'

const sections = [
  { path: '/campaigns', label: 'Campaign' },
  { path: '/milestones', label: 'Milestones' },
  { path: '/evidence', label: 'Bằng chứng' },
]

export function OrganizationWorkspace({ organizationId, section, session, sessionLoading, sessionError, onSession }: {
  organizationId?: string
  section: string
  session: AccountSession | null
  sessionLoading: boolean
  sessionError: string
  onSession: (session: AccountSession | null) => void
}) {
  const [notice, setNotice] = useState('')
  const organizations = useQuery({
    queryKey: ['organizations', session?.userId], queryFn: listOrganizations,
    enabled: Boolean(session), retry: false,
  })
  const activeSection = section || '/campaigns'
  const drafts = /^\/drafts\/([^/]+)(\/edit)?$/.exec(activeSection)
  const profile = /^\/organizations\/([^/]+)$/.exec(activeSection)
  const selectedId = organizationId ?? profile?.[1] ?? organizations.data?.[0]?.id
  const organization = organizations.data?.find((item) => item.id === selectedId)
  const organizationPage = activeSection === '/organizations' || Boolean(profile)
  const currentSection = drafts ? sections[0] : sections.find((item) => item.path === activeSection || activeSection.startsWith(`${item.path}/`))
  const basePath = organization ? `/organizations/${organization.id}/workspace` : '/workspace'

  return <div className="dashboard">
    <aside className="sidebar">
      <div className="sidebar-brand">
        <a className="brand" href="#/workspace"><span className="brand-mark">F</span><span>FundTogether</span></a>
        <span className="workspace-label">Quản lý gây quỹ</span>
        {session && organizations.isSuccess && <label className="workspace-organization-selector">
          Tổ chức đang quản lý
          <select value={organization?.id ?? ''} aria-label="Tổ chức đang quản lý" disabled={organizations.data.length === 0}
            onChange={(event) => { setNotice(''); window.location.hash = organizationSwitchPath(event.target.value, activeSection) }}>
            {!organization && <option value="">{organizations.data.length ? 'Chọn tổ chức' : 'Chưa có tổ chức'}</option>}
            {organizations.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </div>
      <nav className="dashboard-nav" aria-label="Điều hướng quản lý gây quỹ">
        {organization && <a className={`nav-item${profile ? ' nav-item--active' : ''}`}
          href={`#/organizations/${organization.id}`} onClick={() => setNotice('')}
          aria-current={profile ? 'page' : undefined}>Hồ sơ &amp; ví đại diện</a>}
        {sections.map((item) => <a key={item.path} href={`#${basePath}${item.path}`}
          onClick={() => setNotice('')}
          className={`nav-item${!organizationPage && currentSection?.path === item.path ? ' nav-item--active' : ''}`}
          aria-current={!organizationPage && currentSection?.path === item.path ? 'page' : undefined}>{item.label}</a>)}
        <a className={`nav-item${activeSection === '/organizations' ? ' nav-item--active' : ''}`} href="#/organizations"
          onClick={() => setNotice('')}
          aria-current={activeSection === '/organizations' ? 'page' : undefined}>Tổ chức của tôi</a>
      </nav>
      <div className="sidebar-account">
        {session && <AccountAccess session={session} onSession={onSession} compact />}
      </div>
    </aside>
    <div className="dashboard-body">
      <header className="dashboard-topbar"><span>Quản lý gây quỹ / <strong>{organizationPage ? 'Tổ chức của tôi' : currentSection?.label ?? 'Không tìm thấy trang'}</strong></span>
        <a href="#/">Khám phá campaign</a>
      </header>
      <main className="dashboard-content">
        {notice && <p className="toast toast--success" role="status">{notice}</p>}
        {sessionLoading ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : !session ? (
          <section className="panel"><h2>Đăng nhập để quản lý gây quỹ</h2>
            {sessionError && <p role="alert">{sessionError}</p>}
            <AccountAccess session={null} onSession={onSession} />
          </section>
        ) : organizations.isPending ? <p role="status">Đang tải tổ chức…</p> : organizations.isError ? (
          <section className="panel"><p role="alert">{getErrorMessage(organizations.error)}</p>
            <button className="button button--secondary" disabled={organizations.isFetching} onClick={() => void organizations.refetch()}>Thử lại</button>
          </section>
        ) : organizationPage ? <>
          {profile ? <><a className="public-back" href="#/organizations">← Tổ chức của tôi</a>
            <OrganizationProfile key={`${session.userId}:${profile[1]}`} organizationId={profile[1]} userId={session.userId} /></>
            : <OrganizationsPage key={session.userId} userId={session.userId} />}
        </> : organizationId && !organization ? <section className="panel"><h2>Tổ chức không khả dụng</h2>
          <p>Tổ chức không tồn tại hoặc tài khoản này không có quyền quản lý.</p><a href="#/organizations">Chọn tổ chức khác</a></section>
          : drafts && !isAdvance ? <UnassignedCampaignDrafts key={`${session.userId}:${drafts[1]}`} userId={session.userId} campaignId={drafts[1]} editing={Boolean(drafts[2])} onDeleted={setNotice} basePath={basePath} />
          : !currentSection ? <section className="panel"><h2>Không tìm thấy trang</h2></section>
            : <>
                {!organization ? <section className="panel"><h1>Bắt đầu quản lý campaign</h1>
                  <p>Tạo tổ chức để lưu bản nháp và quản lý campaign trong dashboard này.</p>
                  <a className="button button--primary" href="#/organizations">Tạo tổ chức</a>
                </section> : isAdvance ? <AdvanceOrganizationCampaigns key={`${session.userId}:${organization.id}`} organizationId={organization.id} userId={session.userId} section={activeSection} />
                  : currentSection.path === '/evidence' ? <OrganizationEvidence key={`${session.userId}:${organization.id}`}
                  organizationId={organization.id} userId={session.userId} section={activeSection} />
                  : <OrganizationCampaigns key={`${session.userId}:${organization.id}`}
                    organizationId={organization.id} userId={session.userId} section={activeSection}
                    unassignedDrafts={activeSection === '/campaigns' ? <UnassignedCampaignDrafts key={session.userId} userId={session.userId} onDeleted={setNotice} basePath={basePath} /> : undefined} />}
                {!isAdvance && !organization && activeSection === '/campaigns' && <UnassignedCampaignDrafts key={session.userId} userId={session.userId} onDeleted={setNotice} basePath={basePath} />}
              </>}
      </main>
    </div>
  </div>
}
