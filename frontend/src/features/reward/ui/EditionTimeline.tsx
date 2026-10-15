export interface EditionTimelineEvent {
  label: string;
  detail: string;
  tone: 'done' | 'current' | 'pending';
}

interface EditionTimelineProps {
  events: EditionTimelineEvent[];
  className?: string;
}

export function EditionTimeline({ events, className = '' }: EditionTimelineProps) {
  return (
    <ol className={`edition-timeline ${className}`.trim()} aria-label="Tiến trình vòng đời campaign">
      {events.map((evt, idx) => (
        <li
          key={`${evt.label}-${idx}`}
          className={`edition-timeline__item edition-timeline__item--${evt.tone}`}
        >
          <div className="edition-timeline__marker" aria-hidden="true" />
          <div className="edition-timeline__body">
            <div className="edition-timeline__header">
              <span className="edition-timeline__label">{evt.label}</span>
              <span className="public-sr-only">
                {evt.tone === 'done' && ' (Đã hoàn tất)'}
                {evt.tone === 'current' && ' (Đang thực hiện)'}
                {evt.tone === 'pending' && ' (Chờ thực hiện)'}
              </span>
            </div>
            <p className="edition-timeline__detail">{evt.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
