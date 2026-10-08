import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignNextStep, deadlineRemaining, refundEligibilityReason, walletActionReason } from '../src/features/campaigns/campaign-journey.ts'

const organizer = `0x${'1'.repeat(40)}`, donor = `0x${'2'.repeat(40)}`
const campaign = { id: 'campaign', organization: { id: 'org' }, organizer, state: 'FUNDING', fundingDeadline: 110 }
const workflow = { chainTimestamp: '100', currentMilestoneIndex: '0', activationDeadline: '120', evidenceDeadline: '130',
  admissionDeadline: '140', reviewDeadline: '150', refundSnapshotted: false }

test('funding guides donor until the exact chain deadline, then a permissionless finalizer', () => {
  assert.match(campaignNextStep(campaign, workflow).actor, /Người đóng góp/)
  const expired = campaignNextStep(campaign, { ...workflow, chainTimestamp: '110' })
  assert.match(expired.actor, /Bất kỳ/)
  assert.match(expired.action, /chưa tự mở/)
  assert.equal(expired.href, '#refund-title')
})

test('funded and settled campaigns identify organizer wallet and activation deadline', () => {
  for (const state of ['FUNDED', 'MILESTONE_SETTLED']) {
    const step = campaignNextStep({ ...campaign, state }, workflow)
    assert.equal(step.wallet, organizer)
    assert.equal(step.deadline, '120')
    assert.match(step.action, /chưa giải ngân/)
    assert.match(step.href, /organizations\/org\/workspace\/campaigns\/campaign/)
    assert.match(campaignNextStep({ ...campaign, state }, { ...workflow, chainTimestamp: '120' }).action, /quá hạn kích hoạt/)
  }
})

test('active evidence is honest about MVP limits and enables timeout guidance at equality', () => {
  const active = { ...campaign, state: 'MILESTONE_ACTIVE' }
  assert.match(campaignNextStep(active, workflow).action, /chưa mở trên contract/)
  assert.match(campaignNextStep(active, { ...workflow, chainTimestamp: '130' }).action, /quá hạn nộp/)
  assert.equal(campaignNextStep(active, { ...workflow, chainTimestamp: '130' }).href, '#refund-title')
})

test('review and challenged states do not invent an implemented settlement or dispute action', () => {
  assert.match(campaignNextStep({ ...campaign, state: 'EVIDENCE_PENDING' }, workflow).action, /chưa dùng đường tiếp nhận/)
  assert.match(campaignNextStep({ ...campaign, state: 'EVIDENCE_PENDING' }, { ...workflow, chainTimestamp: '140' }).action, /quá hạn/)
  assert.match(campaignNextStep({ ...campaign, state: 'IN_REVIEW' }, workflow).action, /chưa được giải ngân/)
  assert.match(campaignNextStep({ ...campaign, state: 'IN_REVIEW' }, { ...workflow, chainTimestamp: '150' }).action, /chưa mở/)
  assert.equal(campaignNextStep({ ...campaign, state: 'CHALLENGED' }, workflow).href, '')
  assert.match(campaignNextStep({ ...campaign, state: 'CHALLENGED' }, workflow).action, /MVP đã chốt resolver/)
  assert.match(campaignNextStep({ ...campaign, state: 'CHALLENGED' }, workflow).action, /prototype này chưa có đường thoát/)
})

test('MVP evidence guide identifies resolver admission and exact review boundary', () => {
  const mvp = { ...workflow, milestoneMvp: true, caseDeadlines: { resolver: donor, responseDeadline: '200', resolutionDeadline: '300' } }
  const admission = campaignNextStep({ ...campaign, state: 'EVIDENCE_PENDING' }, mvp)
  assert.equal(admission.actor, 'Resolver'); assert.equal(admission.wallet, donor)
  assert.match(admission.action, /72 giờ/)
  assert.match(campaignNextStep({ ...campaign, state: 'IN_REVIEW' }, mvp).action, /ký phản đối/)
  assert.match(campaignNextStep({ ...campaign, state: 'IN_REVIEW' }, { ...mvp, chainTimestamp: '150' }).action, /Ký giải ngân/)
})
test('MVP challenge guide switches actors at exact response and resolution deadlines', () => {
  const mvp = { ...workflow, milestoneMvp: true, caseDeadlines: { resolver: donor, responseDeadline: '200', resolutionDeadline: '300' } }
  const challenged = { ...campaign, state: 'CHALLENGED' }
  assert.match(campaignNextStep(challenged, mvp).actor, /Tổ chức và donor/)
  assert.equal(campaignNextStep(challenged, { ...mvp, chainTimestamp: '200' }).actor, 'Resolver')
  assert.match(campaignNextStep(challenged, { ...mvp, chainTimestamp: '300' }).actor, /Bất kỳ/)
  assert.match(campaignNextStep(challenged, { ...mvp, chainTimestamp: '300' }).action, /Bond trả riêng/)
})

test('terminal campaigns distinguish missing snapshot from donor pull claims without expiry', () => {
  for (const state of ['CANCELLED', 'FUNDING_FAILED', 'FAILED']) {
    assert.match(campaignNextStep({ ...campaign, state }, workflow).action, /Chưa xác nhận/)
    const step = campaignNextStep({ ...campaign, state }, { ...workflow, refundSnapshotted: true })
    assert.match(step.action, /một lần/)
    assert.match(step.action, /Không có hạn/)
    assert.match(step.wallet, /Chính ví/)
  }
  assert.match(campaignNextStep({ ...campaign, state: 'COMPLETED' }, workflow).action, /đã hoàn tất/)
})

test('remaining time uses only the provided chain timestamp and exact boundary', () => {
  assert.match(deadlineRemaining('110', '100'), /10 giây/)
  assert.match(deadlineRemaining('110', '110'), /Đã đến/)
  assert.match(deadlineRemaining('110', '111'), /quá hạn/)
  assert.match(deadlineRemaining('90161', '100'), /1 ngày 1 giờ 1 phút/)
})

test('wallet gate explains each missing prerequisite and accepts only ready linked chain', () => {
  const ready = { sessionLoading: false, signedIn: true, address: donor, linked: true, chainId: 31337, requiredChainId: 31337, walletReady: true }
  assert.equal(walletActionReason(ready), '')
  for (const [patch, reason] of [[{ sessionLoading: true }, /Đang kiểm tra/], [{ signedIn: false }, /Đăng nhập/],
    [{ address: undefined }, /Kết nối/], [{ linked: false }, /chưa liên kết/], [{ chainId: 1 }, /31337/], [{ walletReady: false }, /extension/]])
    assert.match(walletActionReason({ ...ready, ...patch }), reason)
})

test('refund buttons reject duplicate, non-donor and unavailable rights but allow zero payout', () => {
  const refund = { campaign: { ...campaign, state: 'FAILED' }, snapshotted: true, canFinalizeFunding: false,
    canFinalizeMilestone: false, wallets: [{ donor, contributionUnits: '1', claimableUnits: '0', claimed: false }] }
  assert.equal(refundEligibilityReason('claimRefund', refund, donor), '')
  assert.match(refundEligibilityReason('claimRefund', { ...refund, snapshotted: false }, donor), /Chưa mở/)
  assert.match(refundEligibilityReason('claimRefund', refund, organizer), /không đóng góp/)
  assert.match(refundEligibilityReason('claimRefund', { ...refund, wallets: [{ ...refund.wallets[0], claimed: true }] }, donor), /lần hai/)
  assert.match(refundEligibilityReason('finalizeFundingFailure', refund, donor), /hết hạn/)
  assert.match(refundEligibilityReason('finalizeMilestoneTimeout', refund, donor), /chưa đến hạn/)
  assert.equal(refundEligibilityReason('finalizeFundingFailure', { ...refund, canFinalizeFunding: true }, donor), '')
  assert.equal(refundEligibilityReason('finalizeMilestoneTimeout', { ...refund, canFinalizeMilestone: true }, donor), '')
})

test('cancellation requires funding state, organizer address and acknowledgement', () => {
  const refund = { campaign, wallets: [], snapshotted: false }
  assert.match(refundEligibilityReason('cancelCampaign', refund, donor, true), /ví đại diện/)
  assert.match(refundEligibilityReason('cancelCampaign', refund, organizer), /xác nhận/)
  assert.equal(refundEligibilityReason('cancelCampaign', refund, organizer.toUpperCase(), true), '')
  assert.match(refundEligibilityReason('cancelCampaign', { ...refund, campaign: { ...campaign, state: 'FUNDED' } }, organizer, true), /trước khi đủ vốn/)
})
