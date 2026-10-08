import type { AccountSession } from '../../lib/api/auth'
import { ReviewPage } from './ReviewPage'
import { MilestoneReview } from './MilestoneReview'
import './InternalArea.css'

export function InternalArea({ session, sessionLoading, path }: { session: AccountSession | null; sessionLoading: boolean; path: string }) {
  const route = /^\/internal(?:\/campaigns(?:\/([^/]+))?)?\/?$/.exec(path)
  const milestone = /^\/internal\/milestones(?:\/([^/]+)\/(\d+))?\/?$/.exec(path)
  return <div className="internal-area">
    <aside className="internal-sidebar"><a className="brand" href="#/internal"><span className="brand-mark">F</span> FundTogether</a>
      <p className="workspace-label">Internal · xét duyệt</p>
      <nav aria-label="Điều hướng nội bộ"><a href="#/internal/campaigns" aria-current={route ? 'page' : undefined}>Hồ sơ campaign</a>
        <a href="#/internal/milestones" aria-current={milestone ? 'page' : undefined}>Hồ sơ milestone và phản đối</a></nav>
      <a href="#/account">Tài khoản và ví</a><a href="#/">← Khu vực người dùng</a>
      {session && <p className="internal-account">{session.email}</p>}
    </aside>
    <main className="internal-content">{route ? <ReviewPage key={`${session?.userId ?? 'anonymous'}:${route[1] ?? 'queue'}`} session={session} sessionLoading={sessionLoading} campaignId={route[1]} />
      : milestone ? <MilestoneReview campaignId={milestone[1]} index={milestone[2]} />
        : <section className="panel"><h1>Không tìm thấy trang nội bộ</h1><a href="#/internal">Về hàng chờ</a></section>}</main>
  </div>
}
