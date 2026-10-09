import { test } from 'node:test'
import assert from 'node:assert/strict'
import { financialPosition, caseActionBlocked } from '../src/features/campaigns/advance/advance-journey.ts'
const zeroHash = `0x${'0'.repeat(64)}`
const snapshot = { checkpoint: { chainTimestamp: '100' }, campaign: { state: 'CHALLENGE_WINDOW', currentStage: '0', contributed: '2200000000', returned: '0', advanced: '2200000000', refunded: '0', custody: '0', refundSnapshotted: false },
  stages: [{ state: 'CHALLENGE_WINDOW', hardStop: '300', challengeEnd: '101', latestVersion: '1', submissions: [{ version: '1', challengeCase: { caseUsed: false, resolution: 'PENDING', responseEnd: '200', responseHash: zeroHash } }] }] }
test('G1/G2 advances are separate from accepted stages and actual remaining custody', () => {
  assert.equal(financialPosition(snapshot).custody, '0'); assert.equal(financialPosition(snapshot).acceptedStages, 0)
  const g2 = { ...snapshot, campaign: { ...snapshot.campaign, contributed: '3300000000', custody: '1100000000' }, stages: [{ state: 'FINALIZED' }, { state: 'CHALLENGE_WINDOW' }, { state: 'PENDING' }] }
  assert.equal(financialPosition(g2).custody, '1100000000'); assert.equal(financialPosition(g2).acceptedStages, 1)
  assert.throws(() => financialPosition({ ...g2, campaign: { ...g2.campaign, custody: '3300000000' } }))
})
test('contributor, latest version and exclusive challenge deadline gate case opening', () => {
  const donor = { contribution: '1', resolver: false, organizer: false }
  assert.equal(caseActionBlocked(snapshot, 'OPEN_CASE', donor), undefined)
  assert.ok(caseActionBlocked(snapshot, 'OPEN_CASE', { ...donor, contribution: '0' }))
  assert.ok(caseActionBlocked({ ...snapshot, checkpoint: { chainTimestamp: '101' } }, 'OPEN_CASE', donor))
  assert.ok(caseActionBlocked({ ...snapshot, campaign: { ...snapshot.campaign, state: 'CASE_OPEN' } }, 'OPEN_CASE', donor))
  const used = structuredClone(snapshot); used.stages[0].submissions[0].challengeCase.caseUsed = true
  assert.ok(caseActionBlocked(used, 'OPEN_CASE', donor))
})
test('case response has one organizer response and a finite material window', () => {
  const s = structuredClone(snapshot); s.campaign.state = 'CASE_OPEN'
  const owner = { contribution: '0', resolver: false, organizer: true }
  assert.equal(caseActionBlocked(s, 'SUBMIT_CASE_RESPONSE', owner), undefined)
  assert.ok(caseActionBlocked(s, 'ADD_CASE_MATERIAL', owner))
  s.stages[0].submissions[0].challengeCase.responseHash = `0x${'1'.repeat(64)}`
  assert.ok(caseActionBlocked(s, 'SUBMIT_CASE_RESPONSE', owner))
  s.checkpoint.chainTimestamp = '200'
  assert.ok(caseActionBlocked(s, 'ADD_CASE_MATERIAL', { ...owner, contribution: '1' }))
})
