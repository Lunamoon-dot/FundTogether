import { lazy, Suspense } from 'react';
import { CommunityReviewPage, Feed } from '../campaigns/public/Feed';
import { AppShell, type PublicAreaProps } from './AppShell';
import './PublicArea.css';

const AccountAccess = lazy(() => import('../auth/AccountAccess').then(module => ({ default: module.AccountAccess })));
const CampaignPage = lazy(() => import('../campaigns/public/Page').then(module => ({ default: module.CampaignPage })));
const Library = lazy(() => import('../campaigns/backer/Library').then(module => ({ default: module.Library })));
const Studio = lazy(() => import('../campaigns/creator/Studio').then(module => ({ default: module.Studio })));
const Profile = lazy(() => import('../campaigns/creator/Profile').then(module => ({ default: module.Profile })));
const HistoricalEntitlements = lazy(() => import('../campaigns/historical/HistoricalEntitlements').then(module => ({ default: module.HistoricalEntitlements })));
const ResolverConsole = lazy(() => import('../campaigns/resolver/Console').then(module => ({ default: module.Console })));
const AdminConsole = lazy(() => import('../campaigns/resolver/AdminConsole').then(module => ({ default: module.AdminConsole })));

export type { PublicAreaProps };

export function PublicArea(props: PublicAreaProps) {
  const { path, session, sessionLoading, error, onSession } = props;

  const isCampaignFeed = path === '/' || path === '/campaigns';
  const isCampaignCommunityReview = path === '/campaigns/review';
  const isCampaignCreatorStudio = path === '/campaigns/creator';
  const isCampaignCreatorDraft = path === '/campaigns/creator/draft' || path === '/campaigns/creator/new';
  const isCampaignCreatorProfile = path === '/campaigns/creator/profile';
  const isCampaignCreator = isCampaignCreatorStudio || isCampaignCreatorDraft || isCampaignCreatorProfile;
  const isCampaignLibrary = path === '/campaigns/library';
  const isAdmin = path === '/admin' || path === '/campaigns/admin';
  const isCampaignResolver = path === '/campaigns/resolver';
  const campaignDetail = /^(?!\/campaigns\/(?:review|history|library|creator(?:\/|$)|resolver(?:\/|$)|admin(?:\/|$)))\/campaigns\/([^/]+)(?:\/(creator|resolver)(?:\/(feedback))?)?$/.exec(path);
  const history = path === '/campaigns/history';
  const historicalEntitlements = path === '/campaigns/history/entitlements';

  const account = path === '/account' || path === '/workspace';
  const hasAdminRole = session?.roles.includes('ADMIN') ?? false;
  const hasResolverRole = session?.roles.includes('RESOLVER') ?? false;

  return (
    <AppShell {...props}>
      <Suspense fallback={<p role="status" className="muted">Đang mở không gian làm việc…</p>}>
      {/* Campaign Crowdfunding Views */}
      {(isCampaignFeed || history) && (
        <Feed key={history ? 'funded' : 'feed'} initialFilter={history ? 'funded' : 'all'} />
      )}
      {isCampaignCommunityReview && <CommunityReviewPage />}
      {campaignDetail && (
        <CampaignPage
          key={`${campaignDetail[1]}:${session?.userId ?? 'public'}:${campaignDetail[2] ?? 'public'}:${campaignDetail[3] ?? 'overview'}`}
          id={campaignDetail[1]}
          session={session}
          mode={(campaignDetail[2] as 'creator' | 'resolver') || 'public'}
          initialTab={campaignDetail[3] === 'feedback' ? 'activity' : 'overview'}
        />
      )}
      {historicalEntitlements && session && <HistoricalEntitlements key={session.userId} />}
      {(isCampaignCreatorStudio || isCampaignCreatorDraft) && session && <Studio key={session.userId} userId={session.userId} path={path} />}
      {isCampaignCreatorProfile && session && <Profile key={session.userId} userId={session.userId} />}
      {isCampaignLibrary && (
        session ? (
          <Library key={session.userId} userId={session.userId} />
        ) : (
          <p>Đăng nhập để xem bộ sưu tập của bạn.</p>
        )
      )}
      {isAdmin && session && hasAdminRole && <AdminConsole key={session.userId} userId={session.userId} />}
      {isAdmin && !session && (
        <p>
          Đăng nhập để vào trang quản trị. <a href="#/account">Đăng nhập</a>
        </p>
      )}
      {isAdmin && session && !hasAdminRole && (
        <p className="review-notice review-notice--blocked">
          Tài khoản cần có quyền ADMIN để truy cập trang này.
        </p>
      )}
      {isCampaignResolver && session && hasResolverRole && (
        <ResolverConsole key={session.userId} userId={session.userId} />
      )}
      {isCampaignResolver && !session && (
        <p>
          Đăng nhập để vào trang thẩm định. <a href="#/account">Đăng nhập</a>
        </p>
      )}
      {isCampaignResolver && session && !hasResolverRole && (
        <p className="review-notice review-notice--blocked">
          Tài khoản cần có quyền RESOLVER để truy cập trang này.
        </p>
      )}
      {isCampaignCreator && !session && (
        <p>
          Đăng nhập để mở Creator Studio. <a href="#/account">Đăng nhập</a>
        </p>
      )}

      {/* Account / Workspace View */}
      {account && (
        <div className="public-account-page">
          <div className="feed-heading">
            <h1>Tài khoản</h1>
          </div>
          {error && <p className="toast toast--error" role="alert">{error}</p>}
          {sessionLoading ? (
            <p role="status" className="muted">
              Đang kiểm tra phiên đăng nhập…
            </p>
          ) : (
            <AccountAccess session={session} onSession={onSession} />
          )}
        </div>
      )}

      {!isCampaignFeed &&
        !isCampaignCommunityReview &&
        !campaignDetail &&
        !history &&
        !historicalEntitlements &&
        !isCampaignCreator &&
        !isCampaignLibrary &&
        !isAdmin &&
        !isCampaignResolver &&
        !account && (
          <section className="panel public-empty">
            <h1>Không tìm thấy trang</h1>
            <a className="button button--secondary" href="#/">
              Về trang chủ
            </a>
          </section>
        )}
      </Suspense>
    </AppShell>
  );
}
