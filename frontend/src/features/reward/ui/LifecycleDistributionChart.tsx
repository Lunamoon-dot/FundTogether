interface LifecycleDistributionChartProps {
  counts: Record<string, number>;
  className?: string;
}

const PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#4f46e5', // indigo
];

export function LifecycleDistributionChart({
  counts,
  className = '',
}: LifecycleDistributionChartProps) {
  const entries = Object.entries(counts).filter(([, count]) => count >= 0);
  const total = entries.reduce((acc, [, count]) => acc + count, 0);

  if (entries.length === 0 || total === 0) {
    return (
      <div className={`lifecycle-chart lifecycle-chart--empty ${className}`} role="status">
        <p className="muted">Chưa đủ dữ liệu tổng hợp</p>
      </div>
    );
  }

  return (
    <figure
      className={`lifecycle-chart ${className}`}
      aria-label={`Biểu đồ phân bổ trạng thái vòng đời. Tổng cộng: ${total}`}
    >
      <div className="lifecycle-chart__bar" role="img" aria-label="Phân bổ trạng thái">
        {entries.map(([label, count], idx) => {
          if (count === 0) return null;
          const pct = Math.max(1, Math.round((count / total) * 100));
          const color = PALETTE[idx % PALETTE.length];
          return (
            <div
              key={label}
              className="lifecycle-chart__segment"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
              }}
              title={`${label}: ${count} (${pct}%)`}
            />
          );
        })}
      </div>

      <figcaption className="lifecycle-chart__legend">
        <ul className="lifecycle-chart__list">
          {entries.map(([label, count], idx) => {
            const color = PALETTE[idx % PALETTE.length];
            return (
              <li key={label} className="lifecycle-chart__item">
                <span
                  className="lifecycle-chart__dot"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="lifecycle-chart__label">{label}:</span>
                <strong className="lifecycle-chart__count">{count}</strong>
              </li>
            );
          })}
        </ul>
        <div className="lifecycle-chart__summary">
          <span>Tổng cộng: <strong>{total}</strong></span>
        </div>
      </figcaption>
    </figure>
  );
}
