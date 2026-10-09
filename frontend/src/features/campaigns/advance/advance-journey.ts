import type { AdvanceActionInput, AdvanceOwnerWorkflow, AdvanceSnapshot } from '../../../lib/api/generated/advance'

export function ownerActionInput(data: AdvanceOwnerWorkflow, action: AdvanceActionInput['action']): Omit<AdvanceActionInput, 'actorWallet'> {
  return { action, context: data.plan.context, expectedPlanHash: data.plan.planHash, expectedCheckpoint: data.checkpoint,
    expectedState: data.snapshot?.campaign.state ?? 'UNSUBMITTED', expectedCurrentStage: data.snapshot?.campaign.currentStage ?? '0' }
}
export const chainDate = (value: string) => value === '0' ? 'Chưa mở' : new Date(Number(BigInt(value) * 1000n)).toLocaleString('vi-VN')
export function publicActionInput(snapshot: AdvanceSnapshot, action: AdvanceActionInput['action']): Omit<AdvanceActionInput, 'actorWallet'> {
  return { action, context: snapshot.context, expectedPlanHash: snapshot.campaign.planHash, expectedCheckpoint: snapshot.checkpoint,
    expectedState: snapshot.campaign.state, expectedCurrentStage: snapshot.campaign.currentStage }
}
export const advanceStateLabels = { DRAFT: 'Đang thẩm định kế hoạch', APPROVED: 'Đã duyệt kế hoạch', FUNDING: 'Đang gây quỹ',
  FIRST_REVIEW: 'Đủ vốn · chờ eligibility đầu', ADVANCE_AVAILABLE: 'Tổ chức có thể nhận vốn đợt', EXECUTING: 'Tổ chức đang thực hiện',
  EVIDENCE_REVIEW: 'Resolver đang xét hồ sơ', SUPPLEMENT_DUE: 'Tổ chức cần bổ sung hồ sơ', CHALLENGE_WINDOW: 'Đã kết luận đạt · đang mở phản đối',
  CASE_OPEN: 'Đang xử lý phản đối', COMPLETED: 'Đã nghiệm thu toàn bộ đợt', STOPPED: 'Campaign đã dừng' }
export function financialPosition(s: AdvanceSnapshot) {
  const c = s.campaign, stages = s.stages
  if (BigInt(c.contributed) + BigInt(c.returned) !== BigInt(c.advanced) + BigInt(c.refunded) + BigInt(c.custody))
    throw new Error('Số dư chain không khớp C + R = A + F + E. Cần đối chiếu lại trước khi thao tác.')
  return { contributed: c.contributed, advanced: c.advanced, returned: c.returned, refunded: c.refunded, custody: c.custody,
    acceptedStages: stages.filter(s => s.state === 'FINALIZED').length, totalStages: stages.length,
    terminal: ['COMPLETED', 'STOPPED'].includes(c.state), guaranteedBase: c.refundSnapshotted ? c.basePool : null,
    advancedStillOutside: (BigInt(c.advanced) - BigInt(c.returned)).toString() }
}
export function caseActionBlocked(s: AdvanceSnapshot, action: 'OPEN_CASE' | 'ADD_CASE_MATERIAL' | 'SUBMIT_CASE_RESPONSE',
  authority: { contribution: string; resolver: boolean; organizer: boolean }) {
  const c = s.campaign, stage = s.stages[Number(c.currentStage)], now = BigInt(s.checkpoint.chainTimestamp)
  const version = stage.submissions.find(v => v.version === stage.latestVersion)
  if (!version || now >= BigInt(stage.hardStop)) return 'Không có hồ sơ hiện tại còn hạn xử lý.'
  if (action === 'OPEN_CASE') {
    if (!authority.resolver && BigInt(authority.contribution) === 0n) return 'Chỉ ví đã góp hoặc resolver mới mở phản đối.'
    if (c.state !== 'CHALLENGE_WINDOW' || now >= BigInt(stage.challengeEnd)) return 'Đã hết hoặc chưa mở cửa sổ phản đối.'
    if (version.challengeCase.caseUsed) return 'Version này đã dùng case; không có appeal.'
  } else {
    if (action === 'SUBMIT_CASE_RESPONSE' && !authority.organizer) return 'Phản hồi cần ví đại diện tổ chức.'
    if (action === 'ADD_CASE_MATERIAL' && BigInt(authority.contribution) === 0n) return 'Chỉ ví đã góp được bổ sung thông tin.'
    if (c.state !== 'CASE_OPEN' || version.challengeCase.resolution !== 'PENDING' || now >= BigInt(version.challengeCase.responseEnd)) return 'Case không còn trong cửa sổ phản hồi.'
    if (action === 'SUBMIT_CASE_RESPONSE' && !/^0x0+$/.test(version.challengeCase.responseHash)) return 'Tổ chức đã nộp phản hồi cho case này.'
  }
  return undefined
}
