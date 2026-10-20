export type VNextActionRole = 'creator' | 'backer' | 'judge' | 'any'

export type VNextTransactionStage =
  | 'idle'
  | 'wallet_requested'
  | 'submitted'
  | 'receipt_confirmed'
  | 'indexed'
  | 'failed'

const actionRoles: Record<string, VNextActionRole[]> = {
  createCampaign: ['creator'],
  finalizePublication: ['any'],
  retryPublication: ['any'],
  contribute: ['backer'],
  approveToken: ['backer', 'judge'],
  finalizeFunding: ['any'],
  freezeRefundAllocations: ['any'],
  claimRefund: ['backer'],
  submitMilestoneEvidence: ['creator'],
  expireMilestoneSubmission: ['any'],
  finalizeCorrectionFailure: ['any'],
  syncFinalRuling: ['any'],
  retryMilestoneReview: ['any'],
  openAppeal: ['creator'],
  payMilestone: ['any'],
  depositStake: ['judge'],
  withdrawStake: ['judge'],
  reserveCaseStake: ['judge'],
  enroll: ['judge'],
  finalizeSnapshot: ['any'],
  assignCourt: ['any'],
  commitVote: ['judge'],
  revealVote: ['judge'],
  finalizeCourt: ['any'],
  finalizeNoAppeal: ['any'],
  finalizeProtocolFailure: ['any'],
  prepareRetrySettlement: ['any'],
  settleCaseBatch: ['any'],
  settleFinalRuling: ['any'],
  claimReward: ['judge'],
}

const stages: VNextTransactionStage[] = [
  'idle',
  'wallet_requested',
  'submitted',
  'receipt_confirmed',
  'indexed',
  'failed',
]

const stageLabels: Record<VNextTransactionStage, string> = {
  idle: 'Chưa gửi giao dịch',
  wallet_requested: 'Đang chờ ví xác nhận',
  submitted: 'Đã submit transaction',
  receipt_confirmed: 'Receipt on-chain đã thành công',
  indexed: 'Indexer đã xác nhận canonical',
  failed: 'Giao dịch thất bại',
}

export function vnextActionRoles(action: string): VNextActionRole[] | undefined {
  return actionRoles[action]
}

export function vnextTransactionStages(): VNextTransactionStage[] {
  return [...stages]
}

export function vnextStageLabel(stage: VNextTransactionStage): string {
  return stageLabels[stage]
}
