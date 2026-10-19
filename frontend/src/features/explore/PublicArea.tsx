import { lazy, Suspense, useEffect } from 'react';
import { CommunityReviewPage, Feed } from '../campaigns/public/Feed';
import { AppShell, type PublicAreaProps } from './AppShell';
import { resolveCampaignDetailRoute } from './campaignRoutes';
import './PublicArea.css';

const AccountAccess = lazy(() => import('../auth/AccountAccess').then(module => ({ default: module.AccountAccess })));
const PublicCampaignPage = lazy(() => import('../campaigns/public/CampaignPage').then(module => ({ default: module.PublicCampaignPage })));
const CreatorCampaignWorkspacePage = lazy(() => import('../campaigns/creator/CampaignWorkspacePage').then(module => ({ default: module.CreatorCampaignWorkspacePage })));
const ResolverCampaignReviewPage = lazy(() => import('../campaigns/resolver/CampaignReviewPage').then(module => ({ default: module.ResolverCampaignReviewPage })));
const CampaignOperationsPage = lazy(() => import('../campaigns/admin/CampaignOperationsPage').then(module => ({ default: module.AdminCampaignOperationsPage })));
const Library = lazy(() => import('../campaigns/backer/Library').then(module => ({ default: module.Library })));
const Studio = lazy(() => import('../campaigns/creator/Studio').then(module => ({ default: module.Studio })));
const Profile = lazy(() => import('../campaigns/creator/Profile').then(module => ({ default: module.Profile })));
const HistoricalEntitlements = lazy(() => import('../campaigns/historical/HistoricalEntitlements').then(module => ({ default: module.HistoricalEntitlements })));
const ResolverConsole = lazy(() => import('../campaigns/resolver/Console').then(module => ({ default: module.Console })));
const AdminConsole = lazy(() => import('../campaigns/admin/AdminConsole').then(module => ({ default: module.AdminConsole })));

export type { PublicAreaProps };

function LegacyCampaignRedirect({ href }: { href: string }) {
  useEffect(() => {
    if (window.location.hash !== href) window.location.replace(href);
  }, [href]);

  return <p role="status" className="muted">Đang chuyển tới không gian làm việc…</p>;
}

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
  const campaignDetail = resolveCampaignDetailRoute(path);
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
        campaignDetail.legacy ? (
          <LegacyCampaignRedirect href={campaignDetail.canonicalHref} />
        ) : campaignDetail.workspace === 'public' ? (
          <PublicCampaignPage
            key={`${campaignDetail.campaignId}:${session?.userId ?? 'public'}:${campaignDetail.initialTab}`}
            id={campaignDetail.campaignId}
            session={session}
            initialTab={campaignDetail.initialTab}
          />
        ) : campaignDetail.workspace === 'creator' ? (
          session ? (
            <CreatorCampaignWorkspacePage
              key={`${campaignDetail.campaignId}:${session.userId}:${campaignDetail.initialTab}`}
              id={campaignDetail.campaignId}
              session={session}
              initialTab={campaignDetail.initialTab}
            />
          ) : (
            <p>Đăng nhập để mở Creator workspace. <a href="#/account">Đăng nhập</a></p>
          )
        ) : campaignDetail.workspace === 'resolver' ? (
          session && hasResolverRole ? (
            <ResolverCampaignReviewPage
              key={`${campaignDetail.campaignId}:${session.userId}:${campaignDetail.initialTab}`}
              id={campaignDetail.campaignId}
              session={session}
              initialTab={campaignDetail.initialTab}
            />
          ) : !session ? (
            <p>Đăng nhập để mở Resolver workspace. <a href="#/account">Đăng nhập</a></p>
          ) : (
            <p className="review-notice review-notice--blocked">Tài khoản cần có quyền RESOLVER để truy cập workspace này.</p>
          )
        ) : campaignDetail.workspace === 'admin' ? (
          session && hasAdminRole ? (
            <CampaignOperationsPage
              key={`${campaignDetail.campaignId}:${session.userId}:${campaignDetail.initialTab}`}
              id={campaignDetail.campaignId}
              session={session}
              initialTab={campaignDetail.initialTab}
            />
          ) : !session ? (
            <p>Đăng nhập để mở Admin operations workspace. <a href="#/account">Đăng nhập</a></p>
          ) : (
            <p className="review-notice review-notice--blocked">Tài khoản cần có quyền ADMIN để truy cập workspace này.</p>
          )
        ) : (
          <p role="status" className="muted">Không tìm thấy workspace campaign.</p>
        )
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
