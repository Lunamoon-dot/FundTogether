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
    'idle', 'wallet_requested', 'submitted', 'receipt_confirmed', 'indexed', 'failed',
  ])
  assert.equal(actions.vnextStageLabel('receipt_confirmed'), 'Receipt on-chain đã thành công')
  assert.equal(actions.vnextStageLabel('indexed'), 'Indexer đã xác nhận canonical')
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
  const evidence = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextEvidencePanel.tsx'), 'utf8')
  assert.match(page, /VNextActionPanel/)
  assert.match(page, /VNextCreateCampaignPanel/)
  assert.match(page, /vnextIndexer/)
  assert.match(page, /indexer-status/)
  assert.match(page, /VNextCourtDashboard/)
  assert.match(page, /Mở Court Dashboard/)
  assert.match(panel, /contribute/)
  assert.match(panel, /finalizeFunding/)
  assert.match(panel, /submitMilestoneEvidence/)
  assert.match(panel, /claimRefund/)
  assert.match(panel, /contributionOf/)
  assert.match(panel, /refundEntitlement/)
  assert.match(panel, /VNextEvidencePanel/)
  assert.match(evidence, /availability không thay thế kiểm tra hash/)
  assert.match(panel, /vnextBackerPosition/)
  assert.match(panel, /indexed-backer-position/)
  assert.match(panel, /milestones\.map/)
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
  assert.match(panel, /milestone\.state === MILESTONE_CHALLENGE_WINDOW/)
  assert.doesNotMatch(panel, /approveCampaign/)
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
  assert.match(dashboard, /vnext-court-indexer-lag/)
  assert.doesNotMatch(dashboard, /judge\.vote|court\.votes/)
})

test('VNext Milestone Court Dashboard renders canonical assignments without promoting provisional PASS', () => {
  const html = renderToStaticMarkup(createElement(courtDashboard.VNextCourtDashboard, {
    campaignId: '7',
    milestone: {
      milestoneId: 1,
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
    onRefresh: () => undefined,
  }))

  assert.match(html, /0xjudge1/)
  assert.match(html, /Provisional round verdict:<\/strong> PASS/)
  assert.match(html, /Final protocol outcome:<\/strong> PENDING/)
  assert.match(html, /Đây chưa phải kết quả cuối cùng/)
  assert.match(html, /NOT PAID/)
  assert.match(html, /Indexer chưa đồng bộ hoàn toàn/)
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
