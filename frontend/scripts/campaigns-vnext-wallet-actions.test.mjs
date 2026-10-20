import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })

const actions = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-actions.ts')
const descriptor = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-contract-descriptor.ts')
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
  assert.match(page, /Court chưa final canonical outcome/)
  assert.match(page, /claimReward/)
  assert.match(page, /VNextEvidencePanel/)
  assert.match(page, /vnextJudgeLedger/)
  assert.match(page, /judge-ledger/)
  assert.doesNotMatch(page, /approveCampaign/)
})

test('VNext Judge review blocks voting until canonical evidence is available', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextJudgePage.tsx'), 'utf8')
  assert.match(page, /vnextEvidence\(review\.reviewCaseId/)
  assert.match(page, /availabilityPolicy/)
  assert.match(page, /TIMEOUT_RETRY_ELIGIBLE/)
  assert.match(page, /evidenceReady/)
})

test('VNext evidence uses a short-lived access ticket instead of a direct file URL', () => {
  const api = fs.readFileSync(path.join(root, 'src/features/campaigns/api/campaigns.ts'), 'utf8')
  const panel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextEvidencePanel.tsx'), 'utf8')
  assert.match(api, /vnextEvidenceTicket/)
  assert.doesNotMatch(api, /vnextEvidenceFileUrl/)
  assert.match(panel, /window\.location\.assign\(ticket\.url\)/)
})
