import { AccountAccess } from '../auth/AccountAccess'
import type { AccountSession } from '../../lib/api/auth'
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
  const contributions = path === '/contributions'
  const detail = /^\/campaigns\/[^/]+$/.test(path)

  return (
    <div className="public-area">
      <aside className="public-sidebar" aria-label="Khu vực người dùng">
        <a className="brand" href="#/" aria-label="FundTogether — Khám phá">
          <span className="brand-mark">F</span>
          <span>FundTogether</span>
        </a>
        <nav className="public-nav" aria-label="Điều hướng người dùng">
          <a href="#/" aria-current={feed ? 'page' : undefined}>
            Khám phá
          </a>
          <a
            href="#/contributions"
            aria-current={contributions ? 'page' : undefined}
          >
            Đóng góp của tôi
          </a>
        </nav>
        <div className="public-sidebar-account">
          <a
            className="public-sidebar-action"
            href="#/workspace"
            aria-current={path === '/workspace' ? 'page' : undefined}
          >
            <span aria-hidden="true">↗</span> Organizer workspace
          </a>
          <a
            className="public-sidebar-action"
            href="#/account"
            aria-current={path === '/account' ? 'page' : undefined}
          >
            <span className="public-avatar" aria-hidden="true">
              {session ? 'U' : '↗'}
            </span>
            {session ? 'Tài khoản' : 'Đăng nhập'}
          </a>
        </div>
      </aside>

      <main className="public-content">
        {feed && (
          <>
            <section className="feed-toolbar" aria-label="Tìm campaign">
              <label className="feed-search">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 5 5" />
                </svg>
                <span className="public-sr-only">Tìm kiếm campaign</span>
                <input type="search" placeholder="Tìm kiếm campaign" disabled />
              </label>
              <label className="feed-filter">
                <span className="public-sr-only">Trạng thái campaign</span>
                <select disabled defaultValue="all">
                  <option value="all">Tất cả trạng thái</option>
                  <option value="funding">Đang gây quỹ</option>
                  <option value="funded">Đã đủ quỹ</option>
                  <option value="completed">Đã hoàn thành</option>
                </select>
              </label>
            </section>
            <section className="feed-results" aria-labelledby="feed-title">
              <div className="feed-heading">
                <h1 id="feed-title">Khám phá campaign</h1>
                <span>Campaign công khai</span>
              </div>
              <div className="public-empty">
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 48 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <rect x="7" y="8" width="34" height="32" rx="5" />
                  <path d="M7 18h34M16 25h16M16 31h10" />
                </svg>
                <h2>Chưa có campaign công khai để hiển thị</h2>
                <p>
                  Các campaign được công bố sẽ xuất hiện tại đây. Tìm kiếm và bộ
                  lọc sẽ khả dụng khi có dữ liệu.
                </p>
                <a className="button button--secondary" href="#/workspace">
                  Mở Organizer workspace <span aria-hidden="true">↗</span>
                </a>
              </div>
            </section>
          </>
        )}

        {detail && (
          <>
            <a className="public-back" href="#/">
              ← Khám phá campaign
            </a>
            <section className="panel public-empty">
              <h1>Campaign chưa khả dụng</h1>
              <p>Chưa có thông tin công khai để hiển thị campaign này.</p>
              <a className="button button--secondary" href="#/">
                Về feed
              </a>
            </section>
          </>
        )}

        {contributions && (
          <section className="panel public-empty">
            <h1>Đóng góp của tôi</h1>
            <p>
              Lịch sử đóng góp và các khoản hoàn tiền chưa khả dụng. Bạn có thể
              khám phá campaign trước.
            </p>
            <a className="button button--secondary" href="#/">
              Khám phá campaign
            </a>
          </section>
        )}

        {account && (
          <div className="public-account-page">
            <div className="feed-heading">
              <h1>
                {path === '/workspace'
                  ? 'Đăng nhập để mở workspace'
                  : 'Tài khoản'}
              </h1>
            </div>
            {error && (
              <p className="toast toast--error" role="alert">
                {error}
              </p>
            )}
            {sessionLoading ? (
              <p role="status" className="muted">
                Đang kiểm tra phiên đăng nhập…
              </p>
            ) : (
              <>
                {session && (
                  <section className="panel">
                    <h2>Tài khoản FundTogether</h2>
                    <p className="public-wallet-address">{session.email ?? 'Tài khoản đã liên kết ví'}</p>
                    <a className="button button--secondary" href="#/workspace">
                      Mở Organizer workspace <span aria-hidden="true">↗</span>
                    </a>
                  </section>
                )}
                <AccountAccess session={session} onSession={onSession} />
              </>
            )}
          </div>
        )}

        {!feed && !account && !contributions && !detail && (
          <section className="panel public-empty">
            <h1>Không tìm thấy trang</h1>
            <a className="button button--secondary" href="#/">
              Về feed
            </a>
          </section>
        )}
      </main>
      <footer className="public-footer">
        <span>FundTogether</span>
        <span>Local development</span>
      </footer>
    </div>
  )
}
