export type CampaignDetailWorkspace = 'public' | 'creator' | 'resolver' | 'admin';
export type CampaignDetailTab = 'overview' | 'production' | 'commitments' | 'activity';
export type CampaignDetailFocus = 'disbursement' | 'disputes' | 'decisions';

export interface ResolvedCampaignDetailRoute {
  workspace: CampaignDetailWorkspace;
  campaignId: string;
  initialTab: CampaignDetailTab;
  focus?: CampaignDetailFocus;
  legacy: boolean;
  canonicalHref: string;
}

interface CampaignDetailRoutePattern {
  pattern: RegExp;
  workspace: CampaignDetailWorkspace;
  legacy: boolean;
  initialTab?: CampaignDetailTab;
}

const routePrefixes: Record<CampaignDetailWorkspace, string> = {
  public: '#/campaigns',
  creator: '#/campaigns/creator',
  resolver: '#/campaigns/resolver',
  admin: '#/admin/campaigns',
};

const campaignDetailRoutePatterns: CampaignDetailRoutePattern[] = [
  {
    pattern: /^\/campaigns\/creator\/([^/?#]+)(?:\?tab=(overview|production|commitments|activity))?$/,
    workspace: 'creator',
    legacy: false,
  },
  {
    pattern: /^\/campaigns\/resolver\/([^/?#]+)(?:\?tab=(overview|production|commitments|activity)(?:&focus=(disbursement|disputes|decisions))?)?$/,
    workspace: 'resolver',
    legacy: false,
  },
  {
    pattern: /^\/admin\/campaigns\/([^/?#]+)(?:\?tab=(overview|production|commitments|activity))?$/,
    workspace: 'admin',
    legacy: false,
  },
  {
    pattern: /^\/campaigns\/([^/?#]+)\/resolver\/feedback$/,
    workspace: 'resolver',
    legacy: true,
    initialTab: 'activity',
  },
  {
    pattern: /^\/campaigns\/([^/?#]+)\/creator$/,
    workspace: 'creator',
    legacy: true,
  },
  {
    pattern: /^\/campaigns\/([^/?#]+)\/resolver$/,
    workspace: 'resolver',
    legacy: true,
  },
  {
    pattern: /^\/campaigns\/([^/?#]+)(?:\?tab=(overview|production|commitments|activity))?$/,
    workspace: 'public',
    legacy: false,
  },
];

const reservedPublicCampaignIds = new Set([
  'admin',
  'creator',
  'history',
  'library',
  'resolver',
  'review',
  'vnext',
]);

const reservedCreatorCampaignIds = new Set(['draft', 'new', 'profile']);

export function campaignDetailHref(
  workspace: CampaignDetailWorkspace,
  campaignId: string,
  tab?: CampaignDetailTab,
): string {
  const href = `${routePrefixes[workspace]}/${encodeURIComponent(campaignId)}`;
  return tab ? `${href}?tab=${tab}` : href;
}

export function campaignDetailFocusHref(
  workspace: CampaignDetailWorkspace,
  campaignId: string,
  tab: CampaignDetailTab,
  focus: CampaignDetailFocus,
): string {
  return `${campaignDetailHref(workspace, campaignId, tab)}&focus=${focus}`;
}

export function resolveCampaignDetailRoute(path: string): ResolvedCampaignDetailRoute | null {
  for (const route of campaignDetailRoutePatterns) {
    const match = route.pattern.exec(path);
    if (!match) continue;

    let campaignId: string;
    try {
      campaignId = decodeURIComponent(match[1]);
    } catch {
      return null;
    }

    if (!campaignId || campaignId.includes('/')) return null;
    if (route.workspace === 'public' && reservedPublicCampaignIds.has(campaignId)) return null;
    if (route.workspace === 'creator' && reservedCreatorCampaignIds.has(campaignId)) return null;

    const requestedTab = match[2] as CampaignDetailTab | undefined;
    const initialTab = route.initialTab ?? requestedTab ?? 'overview';
    const focus = route.workspace === 'resolver' ? match[3] as CampaignDetailFocus | undefined : undefined;
    const canonicalTab = requestedTab ?? (initialTab === 'overview' ? undefined : initialTab);

    return {
      workspace: route.workspace,
      campaignId,
      initialTab,
      ...(focus ? { focus } : {}),
      legacy: route.legacy,
      canonicalHref: focus
        ? campaignDetailFocusHref(route.workspace, campaignId, canonicalTab ?? 'overview', focus)
        : campaignDetailHref(route.workspace, campaignId, canonicalTab),
    };
  }

  return null;
}
