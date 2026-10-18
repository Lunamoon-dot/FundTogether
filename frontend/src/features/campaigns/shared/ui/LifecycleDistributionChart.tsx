interface LifecycleDistributionChartProps {
  counts: Record<string, number>;
  className?: string;
}

const COLOR_MAP: Record<string, string> = {
  'Chờ duyệt IP': '#d97706',       // Amber
  'Đã xác minh IP': '#28734f',     // Forest green
  'Đang gây quỹ': '#2563eb',       // Blue
  'Chờ kích hoạt': '#7c3aed',      // Purple
  'Ngoại lệ / hoàn tiền': '#9e2a2b', // Vermilion
  'Bản nháp': '#7d7973',
  'Chờ duyệt': '#d97706',
  'Hoàn thành': '#28734f',
};

const PALETTE = [
  '#2563eb', // blue
  '#28734f', // forest green
  '#d97706', // amber
  '#7c3aed', // purple
  '#9e2a2b', // vermilion
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

  let cumPct = 0;
  const segments = entries
    .filter(([, count]) => count > 0)
    .map(([label, count], idx) => {
      const pct = total > 0 ? (count / total) * 100 : 0;
      const offset = cumPct;
      cumPct += pct;
      const color = COLOR_MAP[label] || PALETTE[idx % PALETTE.length];
      return { label, count, pct, offset, color };
    });

  return (
    <figure
      className={`lifecycle-chart lifecycle-chart--pie ${className}`.trim()}
      aria-label={`Biểu đồ phân bổ trạng thái vòng đời. Tổng cộng: ${total}`}
    >
      <div className="lifecycle-pie-container">
        {/* SVG Donut / Pie Chart */}
        <div className="lifecycle-pie-visual">
          <svg
            viewBox="0 0 42 42"
            className="lifecycle-pie__svg"
            role="img"
            aria-label={`Biểu đồ tròn phân bổ: ${total} hồ sơ`}
          >
            {/* Background track */}
            <circle
              className="lifecycle-pie__track"
              cx="21"
              cy="21"
              r="15.915494309189533"
              fill="transparent"
              stroke="#edeae2"
              strokeWidth="4.5"
            />
            {/* Donut slices */}
            {segments.map(seg => (
              <circle
                key={seg.label}
                className="lifecycle-chart__segment lifecycle-pie__slice"
                cx="21"
                cy="21"
                r="15.915494309189533"
                fill="transparent"
                stroke={seg.color}
                strokeWidth="4.5"
                strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                strokeDashoffset={-seg.offset}
                style={{
                  transformOrigin: 'center',
                  transform: 'rotate(-90deg)',
                  transition: 'stroke-dasharray 0.3s ease, stroke-dashoffset 0.3s ease',
                }}
              >
                <title>{`${seg.label}: ${seg.count} (${Math.round(seg.pct)}%)`}</title>
              </circle>
            ))}
            {/* Center label */}
            <text
              x="21"
              y="19.5"
              className="lifecycle-pie__center-val"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {total}
            </text>
            <text
              x="21"
              y="25"
              className="lifecycle-pie__center-unit"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              HỒ SƠ
            </text>
          </svg>
        </div>

        {/* Legend */}
        <figcaption className="lifecycle-chart__legend">
          <ul className="lifecycle-chart__list">
            {entries.map(([label, count], idx) => {
              const color = COLOR_MAP[label] || PALETTE[idx % PALETTE.length];
              const isZero = count === 0;
              return (
                <li
                  key={label}
                  className={`lifecycle-chart__item ${
                    isZero ? 'lifecycle-chart__item--zero' : 'lifecycle-chart__item--active'
                  }`}
                >
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
      </div>
    </figure>
  );
}
