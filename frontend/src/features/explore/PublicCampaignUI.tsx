import { formatMockUsdc, fundingPercent, publicState } from './public-campaign-view'

export function FundingProgress({ contributed, goal }: { contributed: string; goal: string }) {
  const percent = fundingPercent(contributed, goal)
  return <div className="funding-progress">
    <div className="funding-progress__labels"><span>Đã góp</span><strong>{percent}%</strong></div>
    <progress aria-label="Tiến độ gây quỹ" max={100} value={percent} />
    <p><strong>{formatMockUsdc(contributed)}</strong> / {formatMockUsdc(goal)} MockUSDC</p>
  </div>
}

export function CurrentStepPanel({ state }: { state: string }) {
  const current = publicState[state] ?? { title: 'Đang cập nhật', next: 'Tải lại để đọc trạng thái mới nhất.', actor: 'Hệ thống' }
  return <section className="current-step" aria-label="Bước hiện tại">
    <span className="eyebrow">BƯỚC HIỆN TẠI · {current.actor}</span>
    <h2>{current.title}</h2>
    <p>{current.next}</p>
  </section>
}
