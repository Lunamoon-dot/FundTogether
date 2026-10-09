import type { AccountSession } from '../../lib/api/auth'
import { ReviewPage } from './ReviewPage'
import { MilestoneReview } from './MilestoneReview'
import { isAdvance } from '../../lib/web3/deployment-context'
import { AdvanceReview } from './AdvanceReview'
import { AdvanceOrganizationVerification } from './AdvanceOrganizationVerification'
import './InternalArea.css'

export function InternalArea({ session, sessionLoading, path }: { session: AccountSession | null; sessionLoading: boolean; path: string }) {
  const route = /^\/internal(?:\/campaigns(?:\/([^/]+))?)?\/?$/.exec(path)
  const milestone = /^\/internal\/milestones(?:\/([^/]+)\/(\d+))?\/?$/.exec(path)
  const organization = /^\/internal\/organizations(?:\/([^/]+))?\/?$/.exec(path)
  return <div className="internal-area">
    <aside className="internal-sidebar"><a className="brand" href="#/internal"><span className="brand-mark">F</span> FundTogether</a>
      <p className="workspace-label">Internal · xét duyệt</p>
      <nav aria-label="Điều hướng nội bộ"><a href="#/internal/campaigns" aria-current={route ? 'page' : undefined}>Hồ sơ campaign</a>
        <a href="#/internal/milestones" aria-current={milestone ? 'page' : undefined}>Hồ sơ milestone và phản đối</a>
        {isAdvance && <a href="#/internal/organizations" aria-current={organization ? 'page' : undefined}>Xác thực tổ chức · ADMIN</a>}</nav>
      <a href="#/account">Tài khoản và ví</a><a href="#/">← Khu vực người dùng</a>
      {session && <p className="internal-account">{session.email}</p>}
    </aside>
    <main className="internal-content">{isAdvance ? sessionLoading ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : !session ? <section className="panel"><h1>Đăng nhập tài khoản nội bộ</h1><a href="#/account">Đến tài khoản và ví</a></section>
      : organization ? <AdvanceOrganizationVerification key={`${session.userId}:${organization[1] ?? 'queue'}`} session={session} organizationId={organization[1]} />
        : route || milestone ? <AdvanceReview key={`${session.userId}:${route?.[1] ?? milestone?.[1] ?? 'queue'}`} session={session} metadataId={route?.[1] ?? milestone?.[1]} />
          : <section className="panel"><h1>Không tìm thấy trang nội bộ B</h1></section>
      : route ? <ReviewPage key={`${session?.userId ?? 'anonymous'}:${route[1] ?? 'queue'}`} session={session} sessionLoading={sessionLoading} campaignId={route[1]} />
      : milestone ? <MilestoneReview campaignId={milestone[1]} index={milestone[2]} />
        : <section className="panel"><h1>Không tìm thấy trang nội bộ</h1><a href="#/internal">Về hàng chờ</a></section>}</main>
  </div>
}
