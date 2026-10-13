import { AccountAccess } from '../auth/AccountAccess';
import type { AccountSession } from '../../lib/api/auth';
import { OrganizationsPage } from '../organizations/OrganizationsPage';
import { OrganizationProfile } from '../organizations/OrganizationProfile';
import { RewardPublicFeed } from '../reward/RewardPublicFeed';
import { RewardPublicCampaign } from '../reward/RewardPublicCampaign';
import { RewardCreatorStudio } from '../reward/RewardCreatorStudio';
import { RewardBackerEntitlements } from '../reward/RewardBackerEntitlements';
import { RewardResolverConsole } from '../reward/RewardResolverConsole';
import { RewardAdminConsole } from '../reward/RewardAdminConsole';
import { EditionsCampaign, EditionsFeed, EditionsLibrary } from '../reward/EditionsCampaign';
import './PublicArea.css';

interface PublicAreaProps {
  path: string;
  session: AccountSession | null;
  sessionLoading: boolean;
  error: string;
  onSession: (session: AccountSession | null) => void;
}

export function PublicArea({
  path,
  session,
  sessionLoading,
  error,
  onSession,
}: PublicAreaProps) {
  const isRewardFeed = path === '/' || path === '/reward';
  const rewardDetail = /^\/reward\/campaigns\/([^/]+)$/.exec(path);
  const isRewardCreatorStudio = path === '/reward/creator';
  const isRewardCreatorDraft = path === '/reward/creator/draft' || path === '/reward/creator/new';
  const isRewardCreator = isRewardCreatorStudio || isRewardCreatorDraft;
  const isRewardMyRewards = path === '/reward/my-rewards';
  const isAdmin = path === '/admin' || path === '/reward/admin';
  const isRewardResolver = path === '/reward/resolver';
  const edition = /^\/reward\/editions\/([^/]+)(?:\/(creator|resolver))?$/.exec(path);
  const history = path === '/reward/history';
  const historicalRewards = path === '/reward/history/my-rewards';

  const account = path === '/account' || path === '/workspace';
  const organizationProfile = /^\/organizations\/([^/]+)$/.exec(path);
  const organizations = path === '/organizations' || Boolean(organizationProfile);
  const hasAdminRole = session?.roles.includes('ADMIN') ?? false;
  const hasResolverRole = session?.roles.includes('RESOLVER') ?? false;

  return (
    <div className="public-area">
      <aside className="public-sidebar" aria-label="Khu vực người dùng">
        <a className="brand" href="#/" aria-label="FundTogether — Khám phá">
          <span className="brand-mark">F</span><span>FundTogether</span>
        </a>
        <nav className="public-nav" aria-label="Điều hướng người dùng">
          <a href="#/reward" aria-current={isRewardFeed ? 'page' : undefined}>
            Truyện tranh & Artbook
          </a>
          {session && (
            <a href="#/reward/my-rewards" aria-current={isRewardMyRewards ? 'page' : undefined}>
              Phần thưởng của tôi
            </a>
          )}
          {session && (
            <a href="#/reward/creator" aria-current={isRewardCreator ? 'page' : undefined}>
              Creator Studio
            </a>
          )}
          {session && hasAdminRole && (
            <a href="#/admin" aria-current={isAdmin ? 'page' : undefined}>
              🛡️ Quản trị Admin
            </a>
          )}
          {session && hasResolverRole && (
            <a href="#/reward/resolver" aria-current={isRewardResolver ? 'page' : undefined}>
              ⚖️ Thẩm định Resolver
            </a>
          )}
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

        {/* Reward Crowdfunding Views */}
        {isRewardFeed && <EditionsFeed />}
        {history && <RewardPublicFeed />}
        {edition && <EditionsCampaign key={`${edition[1]}:${session?.userId ?? 'public'}:${edition[2] ?? 'public'}`} id={edition[1]} session={session} mode={(edition[2] as 'creator' | 'resolver') || 'public'} />}
        {historicalRewards && session && <RewardBackerEntitlements key={session.userId} />}
        {rewardDetail && <RewardPublicCampaign key={rewardDetail[1]} campaignId={rewardDetail[1]} />}
        {isRewardCreator && session && <RewardCreatorStudio key={session.userId} userId={session.userId} path={path} />}
        {isRewardMyRewards && (session ? <EditionsLibrary key={session.userId} userId={session.userId} /> : <p>Đăng nhập để xem thư viện PDF của bạn.</p>)}
        {isAdmin && session && hasAdminRole && <RewardAdminConsole key={session.userId} userId={session.userId} />}
        {isAdmin && !session && <p>Đăng nhập để vào trang quản trị. <a href="#/account">Đăng nhập</a></p>}
        {isAdmin && session && !hasAdminRole && <p className="review-notice review-notice--blocked">Tài khoản cần có quyền ADMIN để truy cập trang này.</p>}
        {isRewardResolver && session && hasResolverRole && <RewardResolverConsole key={session.userId} userId={session.userId} />}
        {isRewardResolver && !session && <p>Đăng nhập để vào trang thẩm định. <a href="#/account">Đăng nhập</a></p>}
        {isRewardResolver && session && !hasResolverRole && <p className="review-notice review-notice--blocked">Tài khoản cần có quyền RESOLVER để truy cập trang này.</p>}
        {isRewardCreator && !session && <p>Đăng nhập để mở Creator Studio. <a href="#/account">Đăng nhập</a></p>}

        {/* Account / Workspace View */}
        {account && (
          <div className="public-account-page">
            <div className="feed-heading">
              <h1>Tài khoản</h1>
            </div>
            {error && <p className="toast toast--error" role="alert">{error}</p>}
            {sessionLoading ? (
              <p role="status" className="muted">Đang kiểm tra phiên đăng nhập…</p>
            ) : (
              <AccountAccess session={session} onSession={onSession} />
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

        {!isRewardFeed && !rewardDetail && !edition && !history && !historicalRewards && !isRewardCreator && !isRewardMyRewards && !isAdmin && !isRewardResolver && !account && !organizations && (
          <section className="panel public-empty">
            <h1>Không tìm thấy trang</h1>
            <a className="button button--secondary" href="#/">
              Về trang chủ
            </a>
          </section>
        )}
      </main>
      <footer className="public-footer"><span>FundTogether</span><span>Môi trường phát triển · Mạng thử nghiệm</span></footer>
    </div>
  );
}

