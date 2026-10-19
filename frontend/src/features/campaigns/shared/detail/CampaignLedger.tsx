import { formatUnits } from 'viem';
import type { ReactNode } from 'react';
import type { CampaignChain, CampaignPreview } from '../../api/campaigns';

export interface CampaignLedgerProps {
  campaign: CampaignPreview;
  chain: CampaignChain | null;
  actions?: ReactNode;
}

const amount = (value: string) => `${formatUnits(BigInt(value), 6)} MockUSDC`;

function formatDate(value?: string) {
  if (!value) return 'Chưa xác định';
  const date = /^\d+$/.test(value) ? new Date(Number(value) * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CampaignLedger({ campaign, chain, actions }: CampaignLedgerProps) {
  const state = chain?.snapshot;
  const goal = state?.goal || campaign.config.goal;
  const percent = state && goal ? Math.min(100, Number((BigInt(state.raised) * 100n) / BigInt(goal))) : 0;

  return (
    <>
      <div className="monograph-ledger__header">
        <span className="monograph-ledger__kicker">NOTARIAL ESCROW LEDGER</span>
        <h2 className="monograph-ledger__title">Funding summary</h2>
        <div className="monograph-ledger__amount">{state ? amount(state.raised) : '0 MockUSDC'}</div>
        <div className="monograph-ledger__meter" aria-hidden="true"><div className="monograph-ledger__meter-bar" style={{ width: `${percent}%` }} /></div>
        <div className="monograph-ledger__ratio">{percent}% of {amount(campaign.config.goal)}</div>
      </div>
      <div className="monograph-ledger__dates">
        <div className="monograph-ledger__date-row"><span className="monograph-ledger__date-label">Funding deadline</span><span className="monograph-ledger__date-val">{state ? formatDate(state.fundingDeadline) : `${campaign.config.fundingDuration / 86400} ngày`}</span></div>
        <div className="monograph-ledger__date-row"><span className="monograph-ledger__date-label">Delivery deadline</span><span className="monograph-ledger__date-val">{state && BigInt(state.releaseDeadline) > 0n ? formatDate(state.releaseDeadline) : 'Chưa chốt · Creator xác nhận khi hoàn thành campaign'}</span></div>
      </div>
      {actions && <div className="monograph-ledger__actions">{actions}</div>}
      {!state && (
        <div className="monograph-ledger__tier">
          <span className="monograph-ledger__date-label">Tóm tắt tier</span>
          <div className="monograph-ledger__tier-price"><span>Giá 1 PDF:</span><strong>{amount(campaign.config.tiers[0].price)}</strong></div>
        </div>
      )}
    </>
  );
}
