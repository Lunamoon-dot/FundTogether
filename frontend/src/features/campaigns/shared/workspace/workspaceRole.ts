import type { ResolvedCampaignDetailRoute } from '../../../explore/campaignRoutes';

export type WorkspaceRole = 'creator' | 'resolver' | 'admin';

export function resolveWorkspaceRole(path: string, detail: ResolvedCampaignDetailRoute | null): WorkspaceRole | null {
  if (detail?.workspace === 'creator' || path === '/campaigns/creator' || path.startsWith('/campaigns/creator/')) return 'creator';
  if (detail?.workspace === 'resolver' || path === '/campaigns/resolver' || path.startsWith('/campaigns/resolver/')) return 'resolver';
  if (detail?.workspace === 'admin' || path === '/admin' || path === '/campaigns/admin' || path.startsWith('/admin/')) return 'admin';
  return null;
}
