import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })

const actions = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-actions.ts')
const descriptor = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-contract-descriptor.ts')
const courtDashboard = await server.ssrLoadModule('/src/features/campaigns/vnext/VNextCourtDashboard.tsx')
const milestoneFlow = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-milestone-flow.ts')
const refundFlow = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-refund-flow.ts')
const root = path.resolve(import.meta.dirname, '..')

test('VNext action policy keeps Creator and Backer actions explicit', () => {
  assert.deepEqual(actions.vnextActionRoles('contribute'), ['backer'])
  assert.deepEqual(actions.vnextActionRoles('claimRefund'), ['backer'])
  assert.deepEqual(actions.vnextActionRoles('submitMilestoneEvidence'), ['creator'])
  assert.deepEqual(actions.vnextActionRoles('payMilestone'), ['any'])
  assert.equal(actions.vnextActionRoles('approveCampaign'), undefined)
})

test('VNext transaction lifecycle exposes receipt and indexer boundaries', () => {
  assert.deepEqual(actions.vnextTransactionStages(), [
    'idle', 'wallet_requested', 'submitted', 'receipt_confirmed', 'indexing', 'indexed', 'failed',
  ])
  assert.equal(actions.vnextStageLabel('receipt_confirmed'), 'Receipt on-chain đã thành công')
  assert.equal(actions.vnextStageLabel('indexing'), 'Đang chờ indexer xác nhận canonical')
  assert.equal(actions.vnextStageLabel('indexed'), 'Indexer đã xác nhận canonical')
})

test('refund allocation pending keeps the claim action disabled', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: false,
    contribution: 10_000_000n,
    refundClaimed: false,
    indexedRefundClaimed: false,
    simulationReady: false,
    transactionStage: 'idle',
  })

  assert.equal(state.claim.ready, false)
  assert.match(state.claim.reason, /chưa hoàn tất/)
  assert.equal(state.status, 'UNAVAILABLE')
})

test('frozen refund allocation enables an eligible simulated claim', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: true,
    contribution: 10_000_000n,
    refundClaimed: false,
    indexedRefundClaimed: false,
    simulationReady: true,
    transactionStage: 'idle',
  })

  assert.equal(state.claim.ready, true)
  assert.equal(state.claim.reason, undefined)
  assert.equal(state.status, 'READY_TO_CLAIM')
})

test('wallet with no contribution cannot claim a refund', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: true,
    contribution: 0n,
    refundClaimed: false,
    indexedRefundClaimed: false,
    simulationReady: false,
    transactionStage: 'idle',
  })

  assert.equal(state.claim.ready, false)
  assert.match(state.claim.reason, /chưa đóng góp/)
})

test('an on-chain claimed refund blocks duplicate submission while indexing catches up', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: true,
    contribution: 10_000_000n,
    refundClaimed: true,
    indexedRefundClaimed: false,
    simulationReady: false,
    transactionStage: 'idle',
  })

  assert.equal(state.claim.ready, false)
  assert.match(state.claim.reason, /đã claim/)
  assert.equal(state.status, 'INDEXING')
})

test('a submitted claim is not displayed as refunded', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: true,
    contribution: 10_000_000n,
    refundClaimed: false,
    indexedRefundClaimed: false,
    simulationReady: true,
    transactionAction: 'claimRefund',
    transactionStage: 'submitted',
  })

  assert.equal(state.claim.ready, false)
  assert.equal(state.status, 'SUBMITTED')
})

test('canonical indexed refund reports REFUNDED with the indexed amount', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 5,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: true,
    contribution: 10_000_000n,
    refundClaimed: true,
    indexedRefundClaimed: true,
    indexedRefunded: 8_000_000n,
    simulationReady: false,
    transactionAction: 'claimRefund',
    transactionStage: 'indexed',
  })

  assert.equal(state.status, 'REFUNDED')
  assert.equal(state.refundedAmount, 8_000_000n)
})

test('REFUNDING_REMAINDER never enables unsupported refund contract actions', () => {
  const state = refundFlow.vnextRefundDashboardState({
    campaignState: 6,
    walletConnected: true,
    correctChain: true,
    rpcAvailable: true,
    allocationsFrozen: false,
    contribution: 10_000_000n,
    refundClaimed: false,
    indexedRefundClaimed: false,
    simulationReady: false,
    transactionStage: 'idle',
  })

  assert.equal(state.allocation.ready, false)
  assert.equal(state.claim.ready, false)
  assert.match(state.claim.reason, /REFUNDING_REMAINDER/)
})

test('refund dashboard formats token units with deployment decimals', () => {
  assert.equal(refundFlow.displayVNextTokenAmount(10_000_000n, 6), '10 MockUSDC')
  assert.equal(refundFlow.displayVNextTokenAmount(10_000_000n, 18), '0.00000000001 MockUSDC')
})

test('VNext contract descriptors use only the manifest addresses', () => {
  const deployment = {
    configured: true,
    campaignEscrow: '0x1111111111111111111111111111111111111111',
    juryRegistry: '0x2222222222222222222222222222222222222222',
    juryReview: '0x3333333333333333333333333333333333333333',
    tokenAddress: '0x4444444444444444444444444444444444444444',
  }
  assert.equal(descriptor.vnextContractAddress('campaign', deployment), deployment.campaignEscrow)
  assert.equal(descriptor.vnextContractAddress('review', deployment), deployment.juryReview)
  assert.equal(descriptor.vnextContractAddress('registry', deployment), deployment.juryRegistry)
  assert.equal(descriptor.vnextContractAddress('token', deployment), deployment.tokenAddress)
  assert.throws(() => descriptor.vnextContractAddress('campaign', { configured: false }), /not configured/)
})

test('VNext campaign projection exposes permissionless Creator and Backer actions', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextProtocolPage.tsx'), 'utf8')
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')
  const checkout = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextFundingCheckout.tsx'), 'utf8')
  const evidence = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextEvidencePanel.tsx'), 'utf8')
  assert.match(page, /VNextActionPanel/)
  assert.match(page, /VNextCreateCampaignPanel/)
  assert.match(page, /vnextIndexer/)
  assert.match(page, /indexer-status/)
  assert.match(page, /VNextCourtDashboard/)
  assert.match(page, /Mở Milestone Dashboard/)
  assert.match(page, /VNextFundingCheckout/)
  assert.match(checkout, /contribute/)
  assert.match(panel, /finalizeFunding/)
  assert.match(panel, /submitMilestoneEvidence/)
  assert.match(panel, /VNextEvidencePanel/)
  assert.match(evidence, /availability không thay thế kiểm tra hash/)
  assert.match(page, /milestones\.data\?\.length \? milestones\.data\.map/)
  assert.match(panel, /VNextMilestoneActions/)
  assert.match(panel, /retryPublication/)
  assert.match(panel, /Open publication appeal/)
  assert.match(panel, /Finalize publication review/)
  assert.match(panel, /finalOutcome/)
  const fundingClockStart = panel.indexOf('const fundingClock')
  const fundingClockEnd = panel.indexOf('const campaignNumber', fundingClockStart)
  const fundingClock = panel.slice(fundingClockStart, fundingClockEnd)
  assert.match(fundingClock, /getBlock\(\{ blockTag: 'latest' \}\)/)
  assert.match(fundingClock, /fundingChainTimestamp/)
  assert.doesNotMatch(fundingClock, /Math\.floor\(Date\.now\(\) \/ 1000\)/)
  assert.match(panel, /expireMilestoneSubmission/)
  assert.match(panel, /finalizeCorrectionFailure/)
  assert.match(panel, /syncFinalRuling/)
  assert.match(panel, /retryMilestoneReview/)
  assert.match(panel, /openAppeal/)
  assert.match(panel, /finalizeNoAppeal/)
  assert.match(panel, /finalizeProtocolFailure/)
  assert.match(panel, /MILESTONE_CHALLENGE_WINDOW = 9/)
  assert.match(panel, /MILESTONE_CORRECTION = 11/)
  assert.match(panel, /MILESTONE_RESUBMIT = 12/)
  assert.match(panel, /simulateContract/)
  assert.match(panel, /data-vnext-blocked-reason/)
  assert.match(panel, /payoutPreflightReady/)
  assert.match(panel, /transaction\.action === 'payMilestone'/)
  assert.doesNotMatch(panel, /approveCampaign/)
})

test('VNext campaign page owns one dedicated Backer Refund Dashboard', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextProtocolPage.tsx'), 'utf8')
  const actionPanel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')
  const dashboard = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextRefundDashboard.tsx'), 'utf8')
  const flow = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/vnext-refund-flow.ts'), 'utf8')

  assert.match(page, /VNextRefundDashboard/)
  assert.doesNotMatch(actionPanel, /freezeRefundAllocations|claimRefund/)
  assert.match(dashboard, /contributionOf/)
  assert.match(dashboard, /campaignRefundPool/)
  assert.match(dashboard, /campaignRefundSnapshot/)
  assert.match(dashboard, /refundEntitlement/)
  assert.match(dashboard, /refundClaimed/)
  assert.match(dashboard, /refundAllocationsFrozen/)
  assert.match(dashboard, /simulateContract/)
  assert.match(dashboard, /displayVNextTokenAmount/)
  assert.match(flow, /formatUnits/)
  assert.match(dashboard, /REFUND_BATCH_SIZE = 50n/)
  assert.match(dashboard, /freezeRefundAllocations', \[campaignNumber, REFUND_BATCH_SIZE\]/)
})

test('VNext creator creation uses the campaign contract and keeps publication before funding', () => {
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextCreateCampaignPanel.tsx'), 'utf8')
  const actionPanel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')
  assert.match(panel, /createCampaign/)
  assert.match(panel, /usePublicClient/)
  assert.match(panel, /getBlock\(\{ blockTag: 'latest' \}\)/)
  assert.match(panel, /chainTimestamp/)
  assert.doesNotMatch(panel, /Date\.now\(\)/)
  assert.match(actionPanel, /finalizePublication/)
  assert.match(panel, /milestoneBudgets/)
  assert.doesNotMatch(panel, /approveCampaign/)
})

test('VNext Judge workspace exposes stake and assigned commit-reveal actions', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextJudgePage.tsx'), 'utf8')
  assert.match(page, /vnextAssignedReviews/)
  assert.doesNotMatch(page, /queryFn: \(\{ signal \}\) => campaignApi\.vnextReviews\(signal\)/)
  assert.match(page, /vnextAssignedReviews/)
  assert.match(page, /depositStake/)
  assert.match(page, /reserveCaseStake/)
  assert.match(page, /enroll/)
  assert.match(page, /commitVote/)
  assert.match(page, /revealVote/)
  assert.match(page, /roundStatus/)
  assert.match(page, /contributionOf/)
  assert.match(page, /Creator conflict/)
  assert.match(page, /Provisional round verdict/)
  assert.match(page, /Final protocol outcome/)
  assert.match(page, /claimReward/)
  assert.match(page, /VNextEvidencePanel/)
  assert.match(page, /vnextJudgeLedger/)
  assert.match(page, /judge-ledger/)
  assert.match(page, /courtCount/)
  assert.match(page, /courtAssigned/)
  assert.match(page, /client\.multicall/)
  assert.match(page, /assignedCourtIds/)
  assert.match(page, /unassignedCourtIds/)
  assert.match(page, /Assign court/)
  assert.match(page, /invalidateQueries\(\{ queryKey: \['vnext-judge-case-meta'\]\s*\}\)/)
  assert.doesNotMatch(page, /assignCourt', \[caseId, 0n\]/)
  const judgeClockStart = page.indexOf('const judgeClock')
  const judgeClockEnd = page.indexOf('const creatorConflict', judgeClockStart)
  const judgeClock = page.slice(judgeClockStart, judgeClockEnd)
  assert.match(judgeClock, /getBlock\(\{ blockTag: 'latest' \}\)/)
  assert.match(judgeClock, /judgeChainTimestamp/)
  assert.doesNotMatch(judgeClock, /Math\.floor\(Date\.now\(\) \/ 1000\)/)
  assert.doesNotMatch(page, /functionName: 'snapshotFinalized'/)
  assert.match(page, /snapshotFinalized: Number\(roundStatus\) >= ROUND_ASSIGNMENT_PENDING/)
  assert.doesNotMatch(page, /approveCampaign/)
})

test('VNext Milestone Court Dashboard keeps provisional, final and payout states separate', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextCourtDashboard.tsx'), 'utf8')
  assert.match(dashboard, /MAX_COURTS_PER_REVIEW_CASE = 5/)
  assert.match(dashboard, /\.slice\(0, MAX_COURTS_PER_REVIEW_CASE\)/)
  assert.match(dashboard, /Court assignments/)
  assert.match(dashboard, /committedCount/)
  assert.match(dashboard, /revealedCount/)
  assert.match(dashboard, /PASS Courts/)
  assert.match(dashboard, /INVALID Courts/)
  assert.match(dashboard, /Provisional round verdict/)
  assert.match(dashboard, /Final protocol outcome/)
  assert.match(dashboard, /appeal window\/finalization chưa kết thúc/)
  assert.match(dashboard, /milestone\.paid/)
  assert.match(dashboard, /canonical MilestonePaid event/)
  assert.match(dashboard, /PASS không đồng nghĩa tiền đã được giải ngân/)
  assert.match(dashboard, /Preflight on-chain/)
  assert.match(dashboard, /payoutWallet/)
  assert.match(dashboard, /challengeDeadline/)
  assert.match(dashboard, /vnext-court-indexer-lag/)
  assert.doesNotMatch(dashboard, /judge\.vote|court\.votes/)
})

test('VNext Milestone Court Dashboard renders canonical assignments without promoting provisional PASS', () => {
  const html = renderToStaticMarkup(createElement(courtDashboard.VNextCourtDashboard, {
    campaignId: '7',
    milestone: {
      milestoneId: 1,
      budget: '25000000',
      evidenceRevision: '2',
      evidenceHash: null,
      reviewCaseId: '0xcase',
      finalOutcome: null,
      state: 5,
      paid: false,
      lastBlockNumber: '99',
    },
    review: {
      streamId: 'stream-1',
      reviewCaseId: '0xcase',
      rootCaseId: '0xcase',
      campaignId: '7',
      milestoneId: '1',
      evidenceRevision: '2',
      roundId: '0',
      creator: '0xcreator',
      enrolledCount: '3',
      courtCount: '1',
      finalizedCourtCount: '1',
      passCourts: '1',
      failCourts: '0',
      invalidCourts: '0',
      roundOutcome: 1,
      finalOutcome: null,
      outcome: 1,
      finalized: true,
      lastBlockNumber: '99',
      assignments: [],
      courts: [{
        courtId: '0',
        roundId: '0',
        judges: ['0xjudge1', '0xjudge2', '0xjudge3'],
        assignmentStatus: 'ASSIGNED',
        phase: 'FINALIZED',
        committedCount: 3,
        revealedCount: 3,
        finalized: true,
        verdict: 1,
      }],
    },
    indexer: { configured: true, status: 'syncing', lastBlock: '99', headBlock: '100', lagBlocks: '1' },
    payoutWallet: '0x9999999999999999999999999999999999999999',
    onRefresh: () => undefined,
  }))

  assert.match(html, /0xjudge1/)
  assert.match(html, /Provisional round verdict:<\/strong> PASS/)
  assert.match(html, /Final protocol outcome:<\/strong> PENDING/)
  assert.match(html, /Đây chưa phải kết quả cuối cùng/)
  assert.match(html, /NOT PAID/)
  assert.match(html, /Indexer chưa đồng bộ hoàn toàn/)
  assert.match(html, /25 MockUSDC/)
  assert.match(html, /0x9999999999999999999999999999999999999999/)
})

test('VNext CourtResult mapping keeps 3 as TIED and 4 as INVALID', () => {
  assert.equal(milestoneFlow.courtVerdictLabel(3), 'TIED')
  assert.equal(milestoneFlow.courtVerdictLabel(4), 'INVALID')
  assert.equal(milestoneFlow.roundVerdictLabel(3), 'TIED')
  assert.equal(milestoneFlow.roundVerdictLabel(4), 'INVALID')
})

test('VNext payout requires the challenge deadline and successful on-chain preflight', () => {
  const base = {
    paid: false,
    finalOutcome: 1,
    settlementComplete: true,
    synchronized: true,
    transactionStage: 'idle',
  }
  assert.equal(milestoneFlow.vnextPaymentStatus({
    ...base,
    chainTimestamp: 99n,
    challengeDeadline: 100n,
    payoutPreflightReady: false,
  }), 'CHALLENGE_WINDOW_OPEN')
  assert.equal(milestoneFlow.vnextPaymentStatus({
    ...base,
    chainTimestamp: 100n,
    challengeDeadline: 100n,
    payoutPreflightReady: true,
  }), 'PAYOUT_ELIGIBLE')
})

test('VNext payment status never promotes pending transactions to PAID', () => {
  const base = {
    finalOutcome: 1,
    settlementComplete: true,
    synchronized: true,
    chainTimestamp: 100n,
    challengeDeadline: 100n,
    payoutPreflightReady: true,
  }
  assert.equal(milestoneFlow.vnextPaymentStatus({ ...base, paid: false, transactionStage: 'submitted' }), 'TRANSACTION_PENDING')
  assert.equal(milestoneFlow.vnextPaymentStatus({ ...base, paid: false, transactionStage: 'receipt_confirmed' }), 'TRANSACTION_PENDING')
  assert.equal(milestoneFlow.vnextPaymentStatus({ ...base, paid: true, transactionStage: 'indexed' }), 'PAID_INDEXED')
})

test('VNext failed outcomes route to correction or recovery without payout', () => {
  const base = {
    paid: false,
    settlementComplete: true,
    synchronized: true,
    payoutPreflightReady: false,
    transactionStage: 'idle',
  }
  assert.equal(milestoneFlow.vnextPaymentStatus({ ...base, finalOutcome: 2 }), 'CORRECTION')
  assert.equal(milestoneFlow.vnextPaymentStatus({ ...base, finalOutcome: 3 }), 'RECOVERY_REFUND')
})

test('VNext tied and invalid rounds use the bounded retry budget', () => {
  assert.equal(milestoneFlow.vnextRetryStatus(3, 0n, 2n), 'RETRY_ELIGIBLE')
  assert.equal(milestoneFlow.vnextRetryStatus(4, 1n, 2n), 'RETRY_ELIGIBLE')
  assert.equal(milestoneFlow.vnextRetryStatus(3, 2n, 2n), 'RETRY_EXHAUSTED')
  assert.equal(milestoneFlow.vnextRetryStatus(4, 2n, 2n), 'RETRY_EXHAUSTED')
})

test('VNext Judge review blocks voting until canonical evidence is available', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextJudgePage.tsx'), 'utf8')
  assert.match(page, /vnextEvidence\(review\.reviewCaseId/)
  assert.match(page, /availabilityPolicy/)
  assert.match(page, /TIMEOUT_RETRY_ELIGIBLE/)
  assert.match(page, /evidenceReady/)
  const commitStart = page.indexOf('const canCommit')
  const revealStart = page.indexOf('const canReveal')
  const finalizeStart = page.indexOf('const canFinalizeCourt')
  assert.match(page.slice(commitStart, revealStart), /evidenceReady/)
  assert.doesNotMatch(page.slice(revealStart, finalizeStart), /evidenceReady/)
  assert.match(page, /vnextSaltStorageKey/)
  assert.match(page, /Copy salt/)
})

test('VNext appeals expose the token allowance and approve step before openAppeal', () => {
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')
  assert.match(panel, /allowance/)
  assert.match(panel, /appealBond/)
  assert.match(panel, /Approve appeal bond/)
  assert.match(panel, /vnextAppealBondApprovalRequired/)
  assert.match(panel, /deployment\.juryReview/)
  assert.match(panel, /publicationReview\?\.outcome === 2[\s\S]*campaignNumber !== null/)
})

test('VNext evidence uses a short-lived access ticket instead of a direct file URL', () => {
  const api = fs.readFileSync(path.join(root, 'src/features/campaigns/api/campaigns.ts'), 'utf8')
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextEvidencePanel.tsx'), 'utf8')
  assert.match(api, /vnextEvidenceTicket/)
  assert.doesNotMatch(api, /vnextEvidenceFileUrl/)
  assert.match(panel, /window\.location\.assign\(ticket\.url\)/)
})
