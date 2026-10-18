export interface TimelineEvent {
  label: string;
  detail: string;
  tone: 'done' | 'current' | 'pending';
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function Timeline({ events, className = '' }: TimelineProps) {
  return (
    <ol className={`campaign-timeline ${className}`.trim()} aria-label="Tiến trình vòng đời campaign">
      {events.map((evt, idx) => (
        <li
          key={`${evt.label}-${idx}`}
          className={`campaign-timeline__item campaign-timeline__item--${evt.tone}`}
        >
          <div className="campaign-timeline__marker" aria-hidden="true" />
          <div className="campaign-timeline__body">
            <div className="campaign-timeline__header">
              <span className="campaign-timeline__label">{evt.label}</span>
              <span className="public-sr-only">
                {evt.tone === 'done' && ' (Đã hoàn tất)'}
                {evt.tone === 'current' && ' (Đang thực hiện)'}
                {evt.tone === 'pending' && ' (Chờ thực hiện)'}
              </span>
            </div>
            <p className="campaign-timeline__detail">{evt.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
