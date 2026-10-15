import type { CampaignUiState } from './campaignState';

interface NextActionCardProps {
  state: CampaignUiState;
  action?: string;
  href?: string;
  disabled?: boolean;
  className?: string;
}

export function NextActionCard({
  state,
  action,
  href,
  disabled = false,
  className = '',
}: NextActionCardProps) {
  const displayAction = action || state.nextAction;

  return (
    <div className={`edition-next-action-card edition-next-action-card--${state.tone} ${className}`.trim()}>
      <div className="edition-next-action-card__content">
        <span className="edition-next-action-card__eyebrow">
          {state.actor === 'creator' && 'Creator cần thực hiện'}
          {state.actor === 'resolver' && 'Resolver cần xử lý'}
          {state.actor === 'backer' && 'Việc cần làm tiếp theo'}
          {state.actor === 'system' && 'Hệ thống đang xử lý'}
          {state.actor === 'none' && 'Trạng thái hoàn tất'}
        </span>
        <p className="edition-next-action-card__summary">{state.summary}</p>
      </div>

      {displayAction && (
        <div className="edition-next-action-card__actions">
          {href ? (
            <a
              href={disabled ? undefined : href}
              className={`button button--primary ${disabled ? 'button--disabled' : ''}`}
              aria-disabled={disabled}
            >
              {displayAction} →
            </a>
          ) : (
            <button
              type="button"
              className="button button--primary"
              disabled={disabled}
            >
              {displayAction}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
