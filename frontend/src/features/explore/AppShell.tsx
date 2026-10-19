import type React from 'react';
import type { AccountSession } from '../../lib/api/auth';
import { resolveCampaignDetailRoute } from './campaignRoutes';
import './PublicArea.css';
import { resolveWorkspaceRole, WorkspaceShell } from '../campaigns/shared/workspace/WorkspaceShell';

export interface PublicAreaProps {
  path: string;
  session: AccountSession | null;
  sessionLoading: boolean;
  error: string;
  onSession: (session: AccountSession | null) => void;
}

export interface AppShellProps extends PublicAreaProps {
  children: React.ReactNode;
}

export function AppShell({
  path,
  session,
  children,
}: AppShellProps) {
  const campaignDetail = resolveCampaignDetailRoute(path);
  const isCampaignFeed = path === '/' || path === '/campaigns' || path === '/campaigns/history' || campaignDetail?.workspace === 'public';
  const isCampaignCommunityReview = path === '/campaigns/review';
  const isCampaignCreatorStudio = path === '/campaigns/creator';
  const isCampaignCreatorDraft = path === '/campaigns/creator/draft' || path === '/campaigns/creator/new';
  const isCampaignCreatorProfile = path === '/campaigns/creator/profile';
  const isCampaignCreatorWorkspace = isCampaignCreatorStudio || isCampaignCreatorDraft || campaignDetail?.workspace === 'creator';
  const isCampaignLibrary = path === '/campaigns/library';
  const isAdmin = path === '/admin' || path === '/campaigns/admin' || campaignDetail?.workspace === 'admin';
  const isCampaignResolver = path === '/campaigns/resolver' || campaignDetail?.workspace === 'resolver';
  const isAccount = path === '/account' || path === '/workspace';

  const hasAdminRole = session?.roles.includes('ADMIN') ?? false;
  const hasResolverRole = session?.roles.includes('RESOLVER') ?? false;

  const workspaceRole = resolveWorkspaceRole(path, campaignDetail);
  if (workspaceRole) {
    return <WorkspaceShell role={workspaceRole} path={path} detail={campaignDetail} session={session}>{children}</WorkspaceShell>;
  }

  return (
    <div className="public-area campaign-shell">
      <aside className="public-sidebar campaign-shell__sidebar" aria-label="Khu vực người dùng">
        <div className="campaign-shell__brand-block">
          <a className="brand" href="#/" aria-label="FundTogether — Khám phá">
            <img
              className="brand-lockup"
              src="/fundtogether-lockup-condensed.png"
              alt="FundTogether"
            />
          </a>
          <span className="campaign-shell__tagline">Comics & Artbooks</span>
        </div>

        <nav className="public-nav campaign-shell__nav" aria-label="Điều hướng chính">
          <div className="campaign-shell__nav-group">
            <span className="campaign-shell__nav-heading">Khám phá</span>
            <a href="#/campaigns" aria-current={isCampaignFeed ? 'page' : undefined}>
              Truyện tranh & Artbook
            </a>
            <a href="#/campaigns/review" aria-current={isCampaignCommunityReview ? 'page' : undefined}>
              Community Review
            </a>
            {session && (
              <a href="#/campaigns/library" aria-current={isCampaignLibrary ? 'page' : undefined}>
                Bộ sưu tập của tôi
              </a>
            )}
          </div>

          {session && (
            <div className="campaign-shell__nav-group">
              <span className="campaign-shell__nav-heading">Không gian làm việc</span>
              <a href="#/campaigns/creator" aria-current={isCampaignCreatorWorkspace ? 'page' : undefined}>
                Xưởng ấn phẩm
              </a>
              <a href="#/campaigns/creator/profile" aria-current={isCampaignCreatorProfile ? 'page' : undefined}>
                Hồ sơ Studio
              </a>
              {hasResolverRole && (
                <a href="#/campaigns/resolver" aria-current={isCampaignResolver ? 'page' : undefined}>
                  Thẩm định Resolver
                </a>
              )}
              {hasAdminRole && (
                <a href="#/admin" aria-current={isAdmin ? 'page' : undefined}>
                  Quản trị Admin
                </a>
              )}
            </div>
          )}
        </nav>

        <div className="public-sidebar-account campaign-shell__account">
          <span className="network-pill">Mạng thử nghiệm · MockUSDC</span>
          <a
            className="public-sidebar-action"
            href="#/account"
            aria-current={isAccount ? 'page' : undefined}
          >
            <span className="public-avatar" aria-hidden="true">
              {session ? 'U' : '↗'}
            </span>
            <div className="campaign-shell__account-meta">
              <span className="campaign-shell__account-name">
                {session ? 'Tài khoản' : 'Đăng nhập'}
              </span>
              {session?.userId && (
                <span className="campaign-shell__account-role">
                  {hasAdminRole ? 'Admin' : hasResolverRole ? 'Resolver' : 'Creator / Backer'}
                </span>
              )}
            </div>
          </a>
        </div>
      </aside>

      <main className="public-content campaign-shell__main">
        {children}
      </main>
    </div>
  );
}
