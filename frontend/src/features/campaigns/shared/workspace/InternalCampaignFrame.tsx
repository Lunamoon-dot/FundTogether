import type { ReactNode } from 'react';
import { formatUnits } from 'viem';
import type { CampaignChain, CampaignPreview } from '../../api/campaigns';
import type { CampaignDetailTab } from '../../../explore/campaignRoutes';
import { InternalCampaignInspector } from './InternalCampaignInspector';
import type { WorkspaceRole } from './WorkspaceShell';

export interface InternalCampaignFrameProps {
  role: WorkspaceRole;
  campaign: CampaignPreview;
  chain: CampaignChain | null;
  activeTab: CampaignDetailTab;
  onTabChange: (tab: CampaignDetailTab) => void;
  alerts: ReactNode;
  main: ReactNode;
  actions?: ReactNode;
}

const tabs: Record<WorkspaceRole, { id: CampaignDetailTab; label: string }[]> = {
  creator: [
    { id: 'overview', label: 'Tổng quan Studio' },
    { id: 'production', label: 'Sản xuất & bằng chứng' },
    { id: 'commitments', label: 'Giải ngân' },
    { id: 'activity', label: 'Hoạt động' },
  ],
  resolver: [
    { id: 'overview', label: 'Hàng chờ' },
    { id: 'production', label: 'PDF & hoàn thành' },
    { id: 'commitments', label: 'Giải ngân' },
    { id: 'activity', label: 'Nhật ký quyết định' },
  ],
  admin: [
    { id: 'overview', label: 'Tổng quan hệ thống' },
    { id: 'production', label: 'Projection' },
    { id: 'commitments', label: 'Lifecycle' },
    { id: 'activity', label: 'Nhật ký' },
  ],
};

function amount(value?: string | null) {
  if (!value) return '0 MockUSDC';
  try {
    return `${formatUnits(BigInt(value), 6)} MockUSDC`;
  } catch {
    return '—';
  }
}

function canonicalLabel(chain: CampaignChain | null) {
  if (!chain) return 'Chưa đồng bộ';
  if (chain.status === 'ON_CHAIN_CONFIRMED') return 'Đã xác nhận';
  if (chain.status === 'ORPHANED') return 'Orphaned';
  return 'Chưa publish';
}

export function InternalCampaignFrame({ role, campaign, chain, activeTab, onTabChange, alerts, main, actions }: InternalCampaignFrameProps) {
  const snapshot = chain?.snapshot;

  return (
    <div className="workspace-campaign-frame">
      <header className="workspace-campaign-header">
        <div>
          <div className="workspace-eyebrow">Campaign workspace · {role}</div>
          <h1>{campaign.config.title}</h1>
          <p>{campaign.creatorDisplayName} <span aria-hidden="true">·</span> {campaign.id}</p>
        </div>
        <div className="workspace-campaign-header__status">
          <span className="workspace-status-dot" />
          <strong>{canonicalLabel(chain)}</strong>
          <span>chain 31339</span>
        </div>
      </header>

      <nav className="workspace-tabs" aria-label="Campaign workspace sections" role="tablist">
        {tabs[role].map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={activeTab === tab.id ? 'workspace-tab workspace-tab--active' : 'workspace-tab'}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {alerts}

      <section className="workspace-metric-strip" aria-label="Canonical campaign metrics">
        <div><span>Đã huy động</span><strong>{amount(snapshot?.raised)}</strong></div>
        <div><span>Escrow còn lại</span><strong>{amount(snapshot?.escrowed)}</strong></div>
        <div><span>Đã giải ngân</span><strong>{amount(snapshot?.creatorPaid)}</strong></div>
        <div><span>Trạng thái canonical</span><strong>{canonicalLabel(chain)}</strong></div>
      </section>

      <div className="workspace-work-grid">
        <main className="workspace-worksurface">
          {actions && <div className="workspace-worksurface__actions">{actions}</div>}
          {main}
        </main>
        <InternalCampaignInspector role={role} campaign={campaign} chain={chain} />
      </div>
    </div>
  );
}
