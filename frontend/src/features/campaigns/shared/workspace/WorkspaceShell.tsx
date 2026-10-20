import type React from 'react';
import type { AccountSession } from '../../../../lib/api/auth';
import { campaignDetailFocusHref, campaignDetailHref, type CampaignDetailFocus, type CampaignDetailTab, type ResolvedCampaignDetailRoute } from '../../../explore/campaignRoutes';
import type { WorkspaceRole } from './workspaceRole';
import './workspace.css';

interface WorkspaceNavItem {
  label: string;
  href: string | ((detail: ResolvedCampaignDetailRoute | null) => string);
  matches: (path: string, detail: ResolvedCampaignDetailRoute | null) => boolean;
}

type AdminWorkspaceFocus = 'studio' | 'projection' | 'indexer';

function resolverHref(detail: ResolvedCampaignDetailRoute | null, tab: CampaignDetailTab, focus?: CampaignDetailFocus) {
  if (detail?.workspace !== 'resolver') return '#/campaigns/resolver';
  return focus
    ? campaignDetailFocusHref('resolver', detail.campaignId, tab, focus)
    : campaignDetailHref('resolver', detail.campaignId, tab === 'overview' ? undefined : tab);
}

function resolverSectionMatches(detail: ResolvedCampaignDetailRoute | null, tab: CampaignDetailTab, focus?: CampaignDetailFocus) {
  return detail?.workspace === 'resolver' && detail.initialTab === tab && detail.focus === focus;
}

function adminHref(
  detail: ResolvedCampaignDetailRoute | null,
  tab: CampaignDetailTab,
  focus: AdminWorkspaceFocus,
) {
  return detail?.workspace === 'admin'
    ? campaignDetailHref('admin', detail.campaignId, tab)
    : `#/admin?focus=${focus}`;
}

function adminSectionMatches(
  path: string,
  detail: ResolvedCampaignDetailRoute | null,
  tab: CampaignDetailTab,
  focus: AdminWorkspaceFocus,
) {
  return detail?.workspace === 'admin'
    ? detail.initialTab === tab
    : path === `/admin?focus=${focus}`;
}

const workspaceMeta: Record<WorkspaceRole, { label: string; description: string; nav: WorkspaceNavItem[] }> = {
  creator: {
    label: 'Creator Studio',
    description: 'Quản lý sản xuất và phát hành',
    nav: [
      { label: 'Tổng quan Studio', href: '#/campaigns/creator', matches: path => path === '/campaigns/creator' },
      { label: 'Campaign', href: '#/campaigns/creator', matches: (_, detail) => detail?.workspace === 'creator' },
      { label: 'Việc cần làm', href: '#/campaigns/creator', matches: path => path === '/campaigns/creator' },
      { label: 'Sản xuất & bằng chứng', href: '#/campaigns/creator', matches: (path, detail) => detail?.workspace === 'creator' && path.includes('production') },
      { label: 'Giải ngân', href: '#/campaigns/creator', matches: (path, detail) => detail?.workspace === 'creator' && path.includes('activity') },
      { label: 'Hồ sơ Studio', href: '#/campaigns/creator/profile', matches: path => path === '/campaigns/creator/profile' },
    ],
  },
  resolver: {
    label: 'Resolver Console',
    description: 'Thẩm định và ra quyết định',
    nav: [
      { label: 'Hàng chờ', href: '#/campaigns/resolver', matches: path => path === '/campaigns/resolver' },
      { label: 'Campaign đang xử lý', href: detail => resolverHref(detail, 'overview'), matches: (_, detail) => resolverSectionMatches(detail, 'overview') },
      { label: 'Giải ngân', href: detail => resolverHref(detail, 'production', 'disbursement'), matches: (_, detail) => resolverSectionMatches(detail, 'production', 'disbursement') },
      { label: 'PDF & hoàn thành', href: detail => resolverHref(detail, 'production'), matches: (_, detail) => resolverSectionMatches(detail, 'production') },
      { label: 'Tranh chấp', href: detail => resolverHref(detail, 'activity', 'disputes'), matches: (_, detail) => resolverSectionMatches(detail, 'activity', 'disputes') },
      { label: 'Nhật ký quyết định', href: detail => resolverHref(detail, 'commitments', 'decisions'), matches: (_, detail) => resolverSectionMatches(detail, 'commitments', 'decisions') },
    ],
  },
  admin: {
    label: 'Admin Operations',
    description: 'Theo dõi hệ thống và projection',
    nav: [
      { label: 'Tổng quan hệ thống', href: '#/admin', matches: path => path === '/admin' },
      { label: 'Xác minh Studio', href: '#/admin?focus=studio', matches: path => path === '/admin?focus=studio' },
      { label: 'Campaign projection', href: detail => adminHref(detail, 'production', 'projection'), matches: (path, detail) => adminSectionMatches(path, detail, 'production', 'projection') },
      { label: 'Indexer & deployment', href: detail => adminHref(detail, 'commitments', 'indexer'), matches: (path, detail) => adminSectionMatches(path, detail, 'commitments', 'indexer') },
      { label: 'Tài khoản & quyền', href: '#/account', matches: path => path === '/account' },
    ],
  },
};

export interface WorkspaceShellProps {
  role: WorkspaceRole;
  path: string;
  detail: ResolvedCampaignDetailRoute | null;
  session: AccountSession | null;
  children: React.ReactNode;
}

export function WorkspaceShell({ role, path, detail, session, children }: WorkspaceShellProps) {
  const meta = workspaceMeta[role];

  return (
    <div className="workspace-shell" data-workspace-role={role}>
      <aside className="workspace-sidebar" aria-label={`${meta.label} navigation`}>
        <a className="workspace-brand" href="#/" aria-label="FundTogether — Trang công khai">
          <span className="workspace-brand__mark" aria-hidden="true">FT</span>
          <span>
            <strong>FundTogether</strong>
            <small>Ops workspace</small>
          </span>
        </a>

        <div className="workspace-role-block">
          <span className="workspace-eyebrow">Không gian làm việc</span>
          <strong>{meta.label}</strong>
          <span>{meta.description}</span>
        </div>

        <nav className="workspace-nav" aria-label={meta.label}>
          {meta.nav.map(item => {
            const active = item.matches(path, detail);
            const href = typeof item.href === 'function' ? item.href(detail) : item.href;
            return <a key={item.label} href={href} aria-current={active ? 'page' : undefined}>{item.label}</a>;
          })}
        </nav>

        <div className="workspace-sidebar__footer">
          <span className="workspace-network">Mạng thử nghiệm · MockUSDC</span>
          <a className="workspace-account" href="#/account">
            <span className="workspace-account__avatar" aria-hidden="true">{session ? session.userId.slice(0, 1).toUpperCase() : '↗'}</span>
            <span>
              <strong>{session ? session.userId : 'Đăng nhập'}</strong>
              <small>{meta.label}</small>
            </span>
          </a>
          <a className="workspace-public-link" href="#/campaigns">← Về trang công khai</a>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <span className="workspace-eyebrow">FundTogether / {meta.label}</span>
            <h1>{detail ? 'Chi tiết campaign' : meta.label}</h1>
          </div>
          <div className="workspace-topbar__context">
            <span className="workspace-status-dot" aria-hidden="true" />
            <span>Local · Chain 31339</span>
            <a href="#/account">Tài khoản</a>
          </div>
        </header>
        <div className="workspace-content">{children}</div>
      </main>
    </div>
  );
}
