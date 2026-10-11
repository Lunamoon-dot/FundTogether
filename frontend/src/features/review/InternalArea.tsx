import type { AccountSession } from '../../lib/api/auth'
import { HedReviewPage } from './HedReviewPage'
import { HedVendorVerification } from './HedVendorVerification'
import { HedOrganizationVerificationReview } from './HedOrganizationVerificationReview'
import './InternalArea.css'

export function InternalArea({ session, sessionLoading, path }: { session: AccountSession | null; sessionLoading: boolean; path: string }) {
  const canReview = Boolean(session?.roles.includes('RESOLVER'))
  const canVerify = Boolean(session?.roles.includes('ADMIN'))
  const hedQueue = /^\/internal(?:\/requests)?\/?$/.test(path)
  const hedVendors = /^\/internal\/vendors\/?$/.test(path)
  const hedOrganizations = /^\/internal\/organizations\/?$/.test(path)
  return <div className="internal-area">
    <aside className="internal-sidebar"><a className="brand" href="#/internal"><span className="brand-mark">F</span> FundTogether</a>
      <p className="workspace-label">Internal · xét duyệt</p>
      <nav aria-label="Điều hướng nội bộ">{canReview && <a href="#/internal/requests" aria-current={hedQueue ? 'page' : undefined}>Yêu cầu HED</a>}{canVerify && <a href="#/internal/organizations" aria-current={hedOrganizations ? 'page' : undefined}>Tổ chức · ADMIN</a>}{canVerify && <a href="#/internal/vendors" aria-current={hedVendors ? 'page' : undefined}>Vendor HED · ADMIN</a>}</nav>
      <a href="#/account">Tài khoản và ví</a><a href="#/">← Khu vực người dùng</a>
      {session && <p className="internal-account">{session.email}</p>}
    </aside>
    <main className="internal-content">{sessionLoading ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : !session ? <section className="panel"><h1>Đăng nhập tài khoản nội bộ HED</h1><a href="#/account">Đến tài khoản và ví</a></section> : hedQueue && canReview ? <HedReviewPage /> : hedOrganizations && canVerify ? <HedOrganizationVerificationReview /> : hedVendors && canVerify ? <HedVendorVerification /> : <section className="panel"><h1>Không có quyền vào trang nội bộ HED</h1></section>}</main>
  </div>
}
