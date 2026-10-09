import { useState } from 'react'
import { formatUnits } from 'viem'
import type { AdvanceActionInput, AdvanceOwnerWorkflow } from '../../../lib/api/generated/advance'
import { advanceClaimBlocked } from '../../../lib/web3/advance-action'
import { AdvanceWalletAction } from './AdvanceWalletAction'
import { amountUnits } from './advance-plan'
import { ownerActionInput, chainDate } from './advance-journey'
export function AdvanceOrganizerActions({ data, onRefresh }: { data: AdvanceOwnerWorkflow; onRefresh: () => void }) {
  const s = data.snapshot, c = s?.campaign, stage = s?.stages[Number(c?.currentStage ?? '0')]
  const [returnAmount, setReturnAmount] = useState(''), [returnStage, setReturnStage] = useState('0')
  let amount = '', amountError = ''
  if (returnAmount) { try { amount = amountUnits(returnAmount) } catch { amountError = 'Nhập số USDC dương, tối đa 6 số thập phân.' } }
  const selected = s?.stages[Number(returnStage)]
  if (amount && selected && BigInt(amount) > BigInt(selected.advanced) - BigInt(selected.returned)) amountError = 'Số tiền vượt phần advance chưa trả của đợt.'
  const props = { metadataId: data.metadataId, display: { snapshot: s, plan: data.plan }, onRefresh }
  const signer = data.plan.organizer
  const walletAction = (action: AdvanceActionInput['action'], label: string, extra: Partial<AdvanceActionInput> = {}, reason?: string, owner = true) =>
    <AdvanceWalletAction key={`${action}:${extra.stage ?? c?.currentStage ?? '0'}`} {...props}
      input={{ ...ownerActionInput(data, action), ...extra }} label={label} requiredWallet={owner ? signer : undefined} disabledReason={reason} />
  const currentSubmission = stage?.submissions.find(v => v.version === stage.latestVersion)
  const ref = currentSubmission && s && c ? { campaignId: s.campaignId, stage: c.currentStage, version: currentSubmission.version, evidenceHash: currentSubmission.evidenceHash } : undefined
  const now = BigInt(data.checkpoint.chainTimestamp)
  const deadline = c && stage ? ({ FUNDING: c.fundingEnd, FIRST_REVIEW: c.firstReviewEnd, ADVANCE_AVAILABLE: c.claimEnd,
    EXECUTING: stage.submissionEnd, SUPPLEMENT_DUE: stage.submissionEnd, EVIDENCE_REVIEW: stage.reviewEnd,
    CHALLENGE_WINDOW: stage.finalizeEnd, CASE_OPEN: currentSubmission?.challengeCase.resolutionEnd } as Record<string, string | undefined>)[c.state] : undefined
  return <section className="panel"><h2>Vốn và thao tác của tổ chức</h2>
    <p>Mạng {data.plan.context.chainId} · block {data.checkpoint.blockNumber} · thời gian chain {chainDate(data.checkpoint.chainTimestamp)}</p>
    <p className="advance-hash">Ví nhận vốn cố định: {signer}</p>
    {!s ? <><p>Nộp commitment kế hoạch để resolver thẩm định. Chưa có tiền được chuyển ở bước này.</p>
      {walletAction('SUBMIT_CAMPAIGN', 'Nộp kế hoạch on-chain')}</> : <>
      <dl className="advance-financials"><div><dt>Đã góp</dt><dd>{formatUnits(BigInt(c!.contributed), 6)} USDC</dd></div>
        <div><dt>Đã cấp cho tổ chức</dt><dd>{formatUnits(BigInt(c!.advanced), 6)} USDC</dd></div>
        <div><dt>Đã thực trả về escrow</dt><dd>{formatUnits(BigInt(c!.returned), 6)} USDC</dd></div>
        <div><dt>Escrow còn giữ</dt><dd>{formatUnits(BigInt(c!.custody), 6)} USDC</dd></div></dl>
      {c!.state === 'DRAFT' && <p>Đang chờ resolver thẩm định kế hoạch.</p>}
      {c!.state === 'APPROVED' && walletAction('PUBLISH_CAMPAIGN', 'Công bố và mở gây quỹ')}
      {c!.state === 'FIRST_REVIEW' && <p>Đã đủ goal. Resolver cần kiểm tra lại xác thực tổ chức và eligibility trước lần cấp đầu.</p>}
      {stage && <><h3>Đợt {Number(c!.currentStage) + 1} · {stage.state}</h3>
        <p>Ngân sách: {formatUnits(BigInt(stage.budget), 6)} USDC. Cấp tiền một lần cho đợt; nghiệm thu sau thực hiện không cấp lại khoản này.</p>
        {!['COMPLETED', 'STOPPED'].includes(c!.state) && walletAction('CLAIM_ADVANCE', `Nhận ${formatUnits(BigInt(stage.budget), 6)} USDC cho đợt ${Number(c!.currentStage) + 1}`,
          { stage: c!.currentStage }, advanceClaimBlocked(s))}
        {c!.state === 'ADVANCE_AVAILABLE' && <p>Hạn nhận vốn: {chainDate(c!.claimEnd)}</p>}
        {ref && c!.state === 'CHALLENGE_WINDOW' && <>
          <p>Hết cửa sổ phản đối: {chainDate(stage.challengeEnd)}. Tiền dư phải trả: {formatUnits(BigInt(stage.declaredUnused), 6)} USDC.</p>
          {walletAction('FINALIZE_STAGE', Number(c!.currentStage) === s.stages.length - 1 ? 'Chốt nghiệm thu đợt cuối' : 'Chốt nghiệm thu để mở đợt tiếp', { evidenceRef: ref },
            now < BigInt(stage.challengeEnd) ? 'Cửa sổ phản đối vẫn đang mở.' : now >= BigInt(stage.finalizeEnd) ? 'Đã hết hạn chốt; cần xử lý quá hạn.'
              : BigInt(stage.returned) < BigInt(stage.declaredUnused) ? 'Chưa trả đủ tiền dư thực nhận.' : undefined, false)}
        </>}
      </>}
      {c!.advanced !== '0' && <fieldset className="advance-fieldset"><legend>Trả tiền vào escrow</legend>
        <p>Khoản trả được ghi nhận khi token thực sự về contract. Tiền dư khai báo trong báo cáo chưa là tiền đã trả.</p>
        <label>Đợt đã nhận vốn<select value={returnStage} onChange={e => setReturnStage(e.target.value)}>{s.stages.map((v, i) => <option key={i} value={i} disabled={v.advanced === '0'}>Đợt {i + 1} · còn {formatUnits(BigInt(v.advanced) - BigInt(v.returned), 6)} USDC chưa trả</option>)}</select></label>
        <label>Số tiền USDC<input inputMode="decimal" value={returnAmount} onChange={e => setReturnAmount(e.target.value)} /></label>
        {walletAction('RETURN_FUNDS', `Trả ${returnAmount || '0'} USDC`, { stage: returnStage, amount: amount || '0' }, amountError || (!amount ? 'Nhập số tiền cần trả.' : undefined))}
      </fieldset>}
      {!c!.refundSnapshotted && c!.advanced === '0' && walletAction('CANCEL_CAMPAIGN', 'Hủy trước lần cấp vốn đầu')}
      {deadline && now >= BigInt(deadline) && walletAction('FINALIZE_TIMEOUT', 'Xử lý trạng thái quá hạn', {}, undefined, false)}
    </>}
  </section>
}
