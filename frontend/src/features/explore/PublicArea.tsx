import { AccountAccess } from '../auth/AccountAccess'
import type { AccountSession } from '../../lib/api/auth'
import { OrganizationsPage } from '../organizations/OrganizationsPage'
import { OrganizationProfile } from '../organizations/OrganizationProfile'
import { HedCampaignFeed, HedPublicCampaign } from './HedPublicCampaign'
import './PublicArea.css'

interface PublicAreaProps {
  path: string
  session: AccountSession | null
  sessionLoading: boolean
  error: string
  onSession: (session: AccountSession | null) => void
}

export function PublicArea({
  path,
  session,
  sessionLoading,
  error,
  onSession,
}: PublicAreaProps) {
  const feed = path === '/'
  const account = path === '/account' || path === '/workspace'
  const organizationProfile = /^\/organizations\/([^/]+)$/.exec(path)
  const organizations = path === '/organizations' || Boolean(organizationProfile)
  const detail = /^\/campaigns\/([^/]+)$/.exec(path)
  const staff = session?.roles.some(role => role === 'ADMIN' || role === 'RESOLVER') ?? false
  const internalHref = session?.roles.includes('RESOLVER') ? '#/internal/requests' : '#/internal/organizations'
  const internalLabel = session?.roles.includes('RESOLVER') ? 'Yêu cầu HED · RESOLVER' : 'Tổ chức · ADMIN'

  return (
    <div className="public-area">
      <aside className="public-sidebar" aria-label="Khu vực người dùng">
        <a className="brand" href="#/" aria-label="FundTogether — Khám phá">
          <span className="brand-mark">F</span><span>FundTogether</span>
        </a>
        <nav className="public-nav" aria-label="Điều hướng người dùng">
          <a href="#/" aria-current={feed ? 'page' : undefined}>Khám phá</a>
          {session && <a href="#/organizations" aria-current={organizations ? 'page' : undefined}>Tổ chức của tôi</a>}
          {session && <a href="#/workspace" aria-current={path === '/workspace' ? 'page' : undefined}>Quản lý gây quỹ</a>}
          {staff && <a href={internalHref}>{internalLabel}</a>}
        </nav>
        <div className="public-sidebar-account">
          <span className="network-pill">Mạng thử nghiệm · MockUSDC</span>
          <a className="public-sidebar-action" href="#/account" aria-current={account ? 'page' : undefined}>
            <span className="public-avatar" aria-hidden="true">{session ? 'U' : '↗'}</span>
            {session ? 'Tài khoản' : 'Đăng nhập'}
          </a>
        </div>
      </aside>

      <main className="public-content">
        {organizations && (
          <a className="public-back" href={organizationProfile ? '#/organizations' : '#/'}>
            {organizationProfile ? '← Tổ chức của tôi' : '← Về khu vực người dùng'}
          </a>
        )}
        {feed && <HedCampaignFeed />}

        {detail && <HedPublicCampaign key={detail[1]} campaignId={detail[1]} />}

        {account && (
          <div className="public-account-page">
            <div className="feed-heading">
              <h1>{path === '/workspace' ? 'Đăng nhập để mở workspace' : 'Tài khoản'}</h1>
            </div>
            {error && <p className="toast toast--error" role="alert">{error}</p>}
            {sessionLoading ? (
              <p role="status" className="muted">Đang kiểm tra phiên đăng nhập…</p>
            ) : (
              <>
                {session && (
                  <section className="panel">
                    <h2>Tài khoản FundTogether</h2>
                    <p className="public-wallet-address">{session.email ?? 'Tài khoản đã liên kết ví'}</p>
                    <a className="button button--secondary" href="#/workspace">Mở quản lý gây quỹ</a>
                    {staff && <a className="button button--secondary" href={internalHref}>{internalLabel}</a>}
                  </section>
                )}
                <AccountAccess session={session} onSession={onSession} />
              </>
            )}
          </div>
        )}

        {organizations && (sessionLoading ? (
          <p role="status" className="muted">Đang kiểm tra phiên đăng nhập…</p>
        ) : session ? (
          organizationProfile ? (
            <OrganizationProfile organizationId={organizationProfile[1]} userId={session.userId} />
          ) : <OrganizationsPage key={session.userId} userId={session.userId} />
        ) : (
          <section className="public-empty">
            <h1>Tổ chức của tôi</h1>
            <p>Đăng nhập để tạo và xem tổ chức của bạn.</p>
            {error && <p role="alert">{error}</p>}
            <a className="button button--primary" href="#/account">Đăng nhập</a>
          </section>
        ))}

        {!feed && !account && !detail && !organizations && (
          <section className="panel public-empty">
            <h1>Không tìm thấy trang</h1>
            <a className="button button--secondary" href="#/">
              Về feed
            </a>
          </section>
        )}
      </main>
      <footer className="public-footer"><span>FundTogether</span><span>Môi trường phát triển · Mạng thử nghiệm</span></footer>
    </div>
  )
}
