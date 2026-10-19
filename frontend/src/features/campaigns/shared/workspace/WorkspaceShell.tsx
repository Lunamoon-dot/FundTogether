import type React from 'react';
import type { AccountSession } from '../../../../lib/api/auth';
import type { ResolvedCampaignDetailRoute } from '../../../explore/campaignRoutes';
import './workspace.css';

export type WorkspaceRole = 'creator' | 'resolver' | 'admin';

interface WorkspaceNavItem {
  label: string;
  href: string;
  matches: (path: string, detail: ResolvedCampaignDetailRoute | null) => boolean;
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
      { label: 'Campaign đang xử lý', href: '#/campaigns/resolver', matches: (_, detail) => detail?.workspace === 'resolver' },
      { label: 'Giải ngân', href: '#/campaigns/resolver', matches: (path, detail) => detail?.workspace === 'resolver' && path.includes('activity') },
      { label: 'PDF & hoàn thành', href: '#/campaigns/resolver', matches: (path, detail) => detail?.workspace === 'resolver' && path.includes('production') },
      { label: 'Tranh chấp', href: '#/campaigns/resolver', matches: (_, detail) => detail?.workspace === 'resolver' },
      { label: 'Nhật ký quyết định', href: '#/campaigns/resolver', matches: (path, detail) => detail?.workspace === 'resolver' && path.includes('commitments') },
    ],
  },
  admin: {
    label: 'Admin Operations',
    description: 'Theo dõi hệ thống và projection',
    nav: [
      { label: 'Tổng quan hệ thống', href: '#/admin', matches: path => path === '/admin' },
      { label: 'Xác minh Studio', href: '#/admin', matches: (_, detail) => detail?.workspace === 'admin' },
      { label: 'Campaign projection', href: '#/admin', matches: (_, detail) => detail?.workspace === 'admin' },
      { label: 'Indexer & deployment', href: '#/admin', matches: (_, detail) => detail?.workspace === 'admin' },
      { label: 'Tài khoản & quyền', href: '#/admin', matches: path => path === '/admin' },
    ],
  },
};

export function resolveWorkspaceRole(path: string, detail: ResolvedCampaignDetailRoute | null): WorkspaceRole | null {
  if (detail?.workspace === 'creator' || path === '/campaigns/creator' || path.startsWith('/campaigns/creator/')) return 'creator';
  if (detail?.workspace === 'resolver' || path === '/campaigns/resolver' || path.startsWith('/campaigns/resolver/')) return 'resolver';
  if (detail?.workspace === 'admin' || path === '/admin' || path === '/campaigns/admin' || path.startsWith('/admin/')) return 'admin';
  return null;
}

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
            return <a key={item.label} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</a>;
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
