import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })
const flow = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-judge-flow.ts')

const judge = '0x1111111111111111111111111111111111111111'
const reviewCaseId = `0x${'a'.repeat(64)}`
const salt = `0x${'2'.repeat(64)}`

const context = {
  chainId: 31339,
  reviewCaseId,
  courtId: 1n,
  judgeAddress: judge,
}

const baseState = (overrides = {}) => ({
  rpcAvailable: true,
  chainTimestamp: 150n,
  roundStatus: 3,
  enrollmentDeadline: 100n,
  commitDeadline: 200n,
  revealDeadline: 300n,
  creatorConflict: false,
  contributorConflict: false,
  enrolled: true,
  assigned: true,
  evidenceReady: true,
  secretValid: true,
  hasOnchainCommitment: false,
  commitmentMatches: false,
  revealed: false,
  courtFinalized: false,
  judgeSettled: false,
  pendingReward: 0n,
  rewardClaimed: false,
  claimSimulationReady: false,
  transactionStage: 'idle',
  ...overrides,
})

test('generates exactly 32 random bytes through the supplied Web Crypto seam', () => {
  let requestedLength = 0
  const generated = flow.generateVNextJudgeSalt(bytes => {
    requestedLength = bytes.length
    bytes.fill(0xab)
    return bytes
  })

  assert.equal(requestedLength, 32)
  assert.equal(generated, `0x${'ab'.repeat(32)}`)
})

test('frontend commitment matches the Solidity JuryTypes deterministic vector', () => {
  const commitment = flow.makeVNextVoteCommitment({
    chainId: 31339n,
    protocolVersion: 1n,
    campaignId: 7n,
    milestoneId: 2n,
    evidenceRevision: 3n,
    reviewCaseNumber: 11n,
    roundId: 4n,
    courtId: 1n,
    judgeAddress: judge,
    vote: 'FAIL',
    salt,
  })

  assert.equal(commitment, '0x4f6ff2d767079cdb54f6b3a36f73d20969a6ec7ab35dfd8868f75c6e5e7e2449')
})

test('exports and imports a deliberately handled case-bound Judge secret backup', () => {
  const backup = flow.serializeVNextJudgeSecretBackup(context, { vote: 'FAIL', salt })

  assert.deepEqual(flow.parseVNextJudgeSecretBackup(backup, context), { vote: 'FAIL', salt })
  assert.throws(
    () => flow.parseVNextJudgeSecretBackup(backup, { ...context, courtId: 2n }),
    /không thuộc đúng case, court và ví Judge/i,
  )
})

test('distinguishes unassigned enrollment from an assigned Judge', () => {
  const eligible = flow.vnextJudgeCaseState(baseState({ chainTimestamp: 50n, roundStatus: 0, enrolled: false, assigned: false }))
  const notSelected = flow.vnextJudgeCaseState(baseState({ chainTimestamp: 110n, roundStatus: 2, assigned: false }))
  const assigned = flow.vnextJudgeCaseState(baseState())

  assert.equal(eligible.participationStatus, 'ELIGIBLE_NOT_ENROLLED')
  assert.equal(notSelected.participationStatus, 'ENROLLED_NOT_SELECTED')
  assert.equal(assigned.participationStatus, 'ASSIGNED')
})

test('unavailable evidence blocks Commit without blocking a valid Reveal', () => {
  const commit = flow.vnextJudgeCaseState(baseState({ evidenceReady: false }))
  const reveal = flow.vnextJudgeCaseState(baseState({
    evidenceReady: false,
    chainTimestamp: 250n,
    hasOnchainCommitment: true,
    commitmentMatches: true,
  }))

  assert.equal(commit.commit.ready, false)
  assert.match(commit.commit.reason, /evidence.*READY/i)
  assert.equal(reveal.reveal.ready, true)
})

test('pending and RPC-unknown Commit states prevent a duplicate transaction', () => {
  const pending = flow.vnextJudgeCaseState(baseState({ transactionAction: 'commitVote', transactionStage: 'submitted' }))
  const unknown = flow.vnextJudgeCaseState(baseState({
    transactionAction: 'commitVote',
    transactionStage: 'submitted',
    transactionHash: `0x${'b'.repeat(64)}`,
  }))

  assert.equal(pending.commit.ready, false)
  assert.equal(unknown.commit.ready, false)
  assert.match(unknown.commit.reason, /reconcile|đối soát/i)
})

test('confirmed Commit keeps the exact preimage usable for the Reveal window', () => {
  const committed = flow.vnextJudgeCaseState(baseState({
    hasOnchainCommitment: true,
    commitmentMatches: true,
  }))
  const revealWindow = flow.vnextJudgeCaseState(baseState({
    chainTimestamp: 250n,
    hasOnchainCommitment: true,
    commitmentMatches: true,
  }))

  assert.equal(committed.participationStatus, 'AWAITING_REVEAL')
  assert.equal(committed.commit.ready, false)
  assert.equal(revealWindow.reveal.ready, true)
})

test('an authoritatively reverted Commit can be retried after reconciliation', () => {
  const state = flow.vnextJudgeCaseState(baseState({
    transactionAction: 'commitVote',
    transactionStage: 'failed',
    transactionHash: `0x${'c'.repeat(64)}`,
    receiptStatus: 'reverted',
  }))

  assert.equal(state.commit.ready, true)
})

test('an imported wrong salt, expiry and duplicate completion block Reveal separately', () => {
  const mismatch = flow.vnextJudgeCaseState(baseState({ chainTimestamp: 250n, hasOnchainCommitment: true }))
  const expired = flow.vnextJudgeCaseState(baseState({ chainTimestamp: 300n, hasOnchainCommitment: true, commitmentMatches: true }))
  const revealed = flow.vnextJudgeCaseState(baseState({ chainTimestamp: 250n, hasOnchainCommitment: true, commitmentMatches: true, revealed: true }))

  assert.match(mismatch.reveal.reason, /không khớp/i)
  assert.match(expired.reveal.reason, /hết hạn/i)
  assert.match(revealed.reveal.reason, /đã reveal/i)
})

test('Claim requires accrued reward, unclaimed state and successful simulation', () => {
  const absent = flow.vnextJudgeCaseState(baseState({ judgeSettled: true }))
  const simulated = flow.vnextJudgeCaseState(baseState({
    judgeSettled: true,
    pendingReward: 1_000_000n,
    claimSimulationReady: true,
  }))
  const claimed = flow.vnextJudgeCaseState(baseState({
    judgeSettled: true,
    pendingReward: 1_000_000n,
    rewardClaimed: true,
    claimSimulationReady: true,
  }))

  assert.equal(absent.claim.ready, false)
  assert.match(absent.claim.reason, /chưa có reward/i)
  assert.equal(simulated.claim.ready, true)
  assert.equal(claimed.claim.ready, false)
  assert.match(claimed.claim.reason, /đã claim/i)
})
