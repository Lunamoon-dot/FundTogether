import { formatUnits } from 'viem';

interface EditionProgressChartProps {
  pledged: string;
  goal: string;
  className?: string;
}

function formatSafeToken(baseUnits: string): string {
  try {
    const val = BigInt(baseUnits || '0');
    return `${formatUnits(val, 6)} MockUSDC`;
  } catch {
    return '0 MockUSDC';
  }
}

export function EditionProgressChart({ pledged, goal, className = '' }: EditionProgressChartProps) {
  let pledgedBig = 0n;
  let goalBig = 0n;
  try {
    pledgedBig = BigInt(pledged || '0');
    goalBig = BigInt(goal || '0');
  } catch {
    // fallback safe
  }

  const pct = goalBig > 0n ? Number((pledgedBig * 100n) / goalBig) : 0;
  const clampedPct = Math.min(Math.max(pct, 0), 100);

  const pledgedFormatted = formatSafeToken(pledged);
  const goalFormatted = formatSafeToken(goal);

  const isZero = pledgedBig === 0n;
  const summary = isZero
    ? `Chưa có pledge · Mục tiêu ${goalFormatted}`
    : `${pledgedFormatted} trên mục tiêu ${goalFormatted}`;

  const ariaLabel = `Tiến độ gây quỹ: ${summary}`;

  return (
    <div className={`edition-progress-chart ${className}`.trim()} role="img" aria-label={ariaLabel}>
      <div className="edition-progress-chart__header">
        <span className="edition-progress-chart__summary">{summary}</span>
        {!isZero && <strong className="edition-progress-chart__pct">{pct}%</strong>}
      </div>
      <div className="edition-progress-chart__track" aria-hidden="true">
        <div
          className="edition-progress-chart__bar"
          style={{ width: `${clampedPct}%` }}
        />
      </div>
    </div>
  );
}
