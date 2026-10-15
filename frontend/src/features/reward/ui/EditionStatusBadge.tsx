import type { CampaignUiState } from './campaignState';

export function EditionStatusBadge({ state }: { state: CampaignUiState }) {
  return (
    <span className={`edition-status-badge edition-status-badge--${state.tone}`}>
      <span className="edition-status-badge__dot" aria-hidden="true" />
      <span className="edition-status-badge__label">{state.label}</span>
    </span>
  );
}
