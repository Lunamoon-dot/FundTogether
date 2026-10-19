import type { ReactNode } from 'react';
import type { CampaignDetailTab } from '../../../explore/campaignRoutes';

export interface CampaignDetailFrameProps {
  campaignId: string;
  activeTab: CampaignDetailTab;
  onTabChange: (tab: CampaignDetailTab) => void;
  alerts: ReactNode;
  main: ReactNode;
  ledger: ReactNode;
  footer?: ReactNode;
}

const tabs: CampaignDetailTab[] = ['overview', 'production', 'commitments', 'activity'];

function tabLabel(tab: CampaignDetailTab) {
  if (tab === 'overview') return 'Tổng quan (Folio)';
  if (tab === 'production') return 'Sản xuất & Bằng chứng';
  if (tab === 'commitments') return 'Cam kết & Tiến trình';
  return 'Góp ý & Thẩm định';
}

export function CampaignDetailFrame({ campaignId, activeTab, onTabChange, alerts, main, ledger, footer }: CampaignDetailFrameProps) {
  return (
    <>
      <div className="campaign-container monograph-container">
        <div className="monograph-nav">
          <div className="flex items-center gap-1.5">
            <a href="#/campaigns">← The Salon</a>
            <span>/</span>
            <span className="truncate max-w-[140px] font-mono">{campaignId}</span>
            <span>/</span>
            <span className="font-semibold text-neutral-800">The Monograph</span>
          </div>
          <div className="text-xs uppercase text-neutral-500 font-mono">
            CAMPAIGN · COMICS &amp; ARTBOOKS
          </div>
        </div>

        <div className="monograph-tabs" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onTabChange(tab)}
              className={`monograph-tab-btn ${activeTab === tab ? 'monograph-tab-btn--active' : ''}`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {alerts}

        <div className={ledger ? 'monograph-split-layout mt-6' : 'mt-6'}>
          <div className="monograph-folio">{main}</div>
          {ledger && <aside className="monograph-ledger" aria-label="Sổ công chứng ký quỹ">{ledger}</aside>}
        </div>
      </div>
      {footer}
    </>
  );
}
