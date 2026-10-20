import { formatUnits } from 'viem';
import type { CampaignChain, CampaignPreview } from '../../api/campaigns';
import type { WorkspaceRole } from './workspaceRole';

export interface InternalCampaignInspectorProps {
  role: WorkspaceRole;
  campaign: CampaignPreview;
  chain: CampaignChain | null;
}

function amount(value?: string | null) {
  if (!value) return '0 MockUSDC';
  try {
    return `${formatUnits(BigInt(value), 6)} MockUSDC`;
  } catch {
    return '—';
  }
}

function date(value?: string | null) {
  if (!value) return 'Chưa xác định';
  const parsed = /^\d+$/.test(value) ? new Date(Number(value) * 1000) : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function roleNote(role: WorkspaceRole) {
  if (role === 'creator') return 'Theo dõi điều kiện phát hành và các bước cần thực hiện.';
  if (role === 'resolver') return 'Kiểm tra dữ liệu canonical trước khi ký quyết định.';
  return 'Đọc projection và trạng thái hạ tầng; không thao tác tiền từ màn hình này.';
}

export function InternalCampaignInspector({ role, campaign, chain }: InternalCampaignInspectorProps) {
  const snapshot = chain?.snapshot;
  const goal = snapshot?.goal || campaign.config.goal;

  return (
    <aside className="workspace-inspector" aria-label="Campaign inspector">
      <div className="workspace-inspector__heading">
        <span className="workspace-eyebrow">Operational context</span>
        <h2>Điều kiện &amp; canonical state</h2>
        <p>{roleNote(role)}</p>
      </div>

      <section className="workspace-inspector__section">
        <div className="workspace-inspector__section-title">Sổ tiền</div>
        <dl className="workspace-definition-list">
          <div><dt>Goal</dt><dd>{amount(goal)}</dd></div>
          <div><dt>Raised</dt><dd>{amount(snapshot?.raised)}</dd></div>
          <div><dt>Escrow</dt><dd>{amount(snapshot?.escrowed)}</dd></div>
          <div><dt>Creator đã nhận</dt><dd>{amount(snapshot?.creatorPaid)}</dd></div>
        </dl>
      </section>

      <section className="workspace-inspector__section">
        <div className="workspace-inspector__section-title">Mốc policy</div>
        <dl className="workspace-definition-list">
          <div><dt>Funding deadline</dt><dd>{date(snapshot?.fundingDeadline)}</dd></div>
          <div><dt>Release deadline</dt><dd>{date(snapshot?.releaseDeadline)}</dd></div>
          <div><dt>On-chain campaign</dt><dd>{chain?.onchainCampaignId || 'Chưa bind'}</dd></div>
        </dl>
      </section>

      <section className="workspace-inspector__section workspace-inspector__section--technical">
        <div className="workspace-inspector__section-title">Projection</div>
        <div className="workspace-mono-value">{chain?.status || 'NOT_PUBLISHED'}</div>
        <div className="workspace-mono-value">chainId 31339 · state {snapshot?.state ?? '—'}</div>
      </section>
    </aside>
  );
}
