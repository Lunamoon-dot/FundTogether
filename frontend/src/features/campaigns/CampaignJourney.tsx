import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import deployment from '../../../../backend/src/blockchain/generated/deployment.local.json'
import type { CampaignWorkflow, IndexerStatus, PublicCampaign } from '../../lib/api/public-campaigns'
import { campaignNextStep, campaignStatusLabel, deadlineRemaining } from './campaign-journey'

export function CampaignJourney({ campaign, workflow, sync, inWorkspace = false }: {
  campaign: PublicCampaign; workflow?: CampaignWorkflow; sync: IndexerStatus; inWorkspace?: boolean
}) {
  const [machineTimestamp, setMachineTimestamp] = useState(() => Date.now() / 1000)
  useEffect(() => {
    const timer = setInterval(() => setMachineTimestamp(Date.now() / 1000), 10_000)
    return () => clearInterval(timer)
  }, [])
  if (!workflow) return <section className="panel"><h2>Việc cần làm tiếp theo</h2><p role="status">Chưa có checkpoint để xác định bước tiếp theo. Tải lại dữ liệu campaign.</p></section>
  const step = campaignNextStep(campaign, workflow)
  const publicAction = inWorkspace && step.href && !step.href.startsWith('#/')
  const localClockBehind = campaign.chainId === 31337 && machineTimestamp - Number(workflow.chainTimestamp) > 60
  return <section className="panel campaign-journey" aria-label="Hướng dẫn theo trạng thái campaign">
    <h2>Việc cần làm tiếp theo</h2>
    <p className="journey-state">{campaignStatusLabel(campaign, workflow.chainTimestamp)}</p>
    {sync.status !== 'ready' && <p role="status">Indexer đang đồng bộ. Hướng dẫn dưới đây phản ánh checkpoint hiện có; chờ đồng bộ trước khi ký thao tác mới.</p>}
    {localClockBehind && <p className="review-notice review-notice--blocked" role="alert">Thời gian block local đang chậm hơn đồng hồ máy trên một phút. Kiểm tra Anvil có mine block định kỳ và indexer có theo kịp không. Deadline và quyền hoàn tiền vẫn tính theo thời gian chain; không tự đổi trạng thái theo đồng hồ máy.</p>}
    <dl className="journey-facts">
      <div><dt>Đang chờ ai?</dt><dd>{step.actor}</dd></div>
      <div><dt>Cần làm gì?</dt><dd>{step.action}</dd></div>
      <div><dt>Ví cần dùng · mạng {campaign.chainId}</dt><dd className="public-wallet-address">{step.wallet}</dd></div>
      {step.deadline !== '0' && <div><dt>{step.deadlineLabel}</dt><dd>{new Date(Number(step.deadline) * 1000).toLocaleString('vi-VN')}<br />{deadlineRemaining(step.deadline, workflow.chainTimestamp)}</dd></div>}
      {workflow.refundSnapshotted && <div><dt>Quỹ hoàn tiền đã chốt</dt><dd>{formatUnits(BigInt(workflow.refundPoolUnits), deployment.tokenDecimals)} MockUSDC. Quyền nhận của từng ví được đối chiếu ở phần Hoàn tiền.</dd></div>}
      <div><dt>Thời gian chain đã đối chiếu</dt><dd>{new Date(Number(workflow.chainTimestamp) * 1000).toLocaleString('vi-VN')} · block {workflow.checkedBlock}</dd></div>
    </dl>
    <p className="muted">Hạn xử lý tính bằng timestamp của block, không dùng đồng hồ máy. Chain local chưa mine block mới có thể giữ nguyên thời gian này.</p>
    {step.href && (publicAction ? <a className="button button--secondary" href={`#/campaigns/${campaign.id}`}>Mở trang công khai để thực hiện bước này</a>
      : inWorkspace && ['FUNDED', 'MILESTONE_SETTLED'].includes(campaign.state) ? <button className="button button--secondary" onClick={() => document.getElementById('milestone-activation-title')?.scrollIntoView({ behavior: 'smooth' })}>Đến bước kích hoạt milestone</button>
        : step.href.startsWith('#/') ? <a className="button button--secondary" href={step.href}>{step.link}</a>
      : <button className="button button--secondary" onClick={() => document.getElementById(step.href.slice(1))?.scrollIntoView({ behavior: 'smooth' })}>{step.link}</button>)}
  </section>
}
