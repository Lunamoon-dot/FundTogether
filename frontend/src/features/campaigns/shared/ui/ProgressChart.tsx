import { formatUnits } from 'viem';
import { fundingProgressPercent } from './fundingProgress';

interface ProgressChartProps {
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

export function ProgressChart({ pledged, goal, className = '' }: ProgressChartProps) {
  let pledgedBig = 0n;
  try {
    pledgedBig = BigInt(pledged || '0');
  } catch {
    // fallback safe
  }

  const pct = fundingProgressPercent(pledged, goal);

  const pledgedFormatted = formatSafeToken(pledged);
  const goalFormatted = formatSafeToken(goal);

  const isZero = pledgedBig === 0n;
  const summary = isZero
    ? `Chưa có pledge · Mục tiêu ${goalFormatted}`
    : `${pledgedFormatted} trên mục tiêu ${goalFormatted}`;

  const ariaLabel = `Tiến độ gây quỹ: ${summary}`;

  return (
    <div className={`campaign-progress-chart ${className}`.trim()} role="img" aria-label={ariaLabel}>
      <div className="campaign-progress-chart__header">
        <span className="campaign-progress-chart__summary">{summary}</span>
        {!isZero && <strong className="campaign-progress-chart__pct">{pct}%</strong>}
      </div>
      <div className="campaign-progress-chart__track" aria-hidden="true">
        <div
          className="campaign-progress-chart__bar"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
