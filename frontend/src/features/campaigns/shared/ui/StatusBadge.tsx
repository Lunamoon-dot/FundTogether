import type { CampaignUiState } from './campaignState';

export function StatusBadge({ state }: { state: CampaignUiState }) {
  return (
    <span className={`campaign-status-badge campaign-status-badge--${state.tone}`}>
      <span className="campaign-status-badge__dot" aria-hidden="true" />
      <span className="campaign-status-badge__label">{state.label}</span>
    </span>
  );
}
