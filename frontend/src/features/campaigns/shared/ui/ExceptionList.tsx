export interface ExceptionItem {
  id: string;
  label: string;
  severity: 'info' | 'warning' | 'danger';
  owner: string;
  actionHref?: string;
}

interface ExceptionListProps {
  items: ExceptionItem[];
  className?: string;
}

const SEVERITY_CONFIG: Record<
  ExceptionItem['severity'],
  { label: string; badgeClass: string }
> = {
  info: { label: 'Lưu ý', badgeClass: 'exception-badge--info' },
  warning: { label: 'Cần xem xét', badgeClass: 'exception-badge--warning' },
  danger: { label: 'Khẩn cấp', badgeClass: 'exception-badge--danger' },
};

export function ExceptionList({ items, className = '' }: ExceptionListProps) {
  if (items.length === 0) {
    return (
      <div className={`exception-list exception-list--empty ${className}`} role="status">
        <span className="exception-list__empty-icon" aria-hidden="true">✓</span>
        <p className="muted">Không có ngoại lệ vận hành nào cần xử lý.</p>
      </div>
    );
  }

  return (
    <div className={`exception-list ${className}`} aria-label="Ngoại lệ vận hành">
      <ul className="exception-list__items">
        {items.map(item => {
          const config = SEVERITY_CONFIG[item.severity];
          return (
            <li
              key={item.id}
              className={`exception-item exception-item--${item.severity}`}
            >
              <div className="exception-item__content">
                <div className="exception-item__header">
                  <span className={`exception-badge ${config.badgeClass}`}>
                    {config.label}
                  </span>
                  <span className="exception-item__owner">Phụ trách: <strong>{item.owner}</strong></span>
                </div>
                <p className="exception-item__label">{item.label}</p>
              </div>

              {item.actionHref && (
                <a
                  href={item.actionHref}
                  className="button button--secondary button--sm exception-item__action"
                >
                  Xử lý →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
