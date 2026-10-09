import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { encodeEventTopics, encodeAbiParameters, encodeFunctionData } from 'viem'
import { advanceCall, advanceClaimBlocked, advanceTrackingKey, verifyAdvanceReceipt, isAdvanceIndexed } from '../src/lib/web3/advance-action.ts'
const abi = JSON.parse(fs.readFileSync(new URL('../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json', import.meta.url)))
const hash = n => `0x${String(n).repeat(64)}`, address = n => `0x${String(n).repeat(40)}`
const context = { protocolKind: 'ADVANCE', chainId: 31338, deploymentId: hash(1), contractAddress: address(1), tokenAddress: address(2), resolver: address(3), workflowPolicy: hash(2), abiVersion: '1', confirmations: 1 }
const deployment = { ...context, genesisHash: hash(3), deploymentBlockHash: hash(4) }
const input = { action: 'CLAIM_ADVANCE', context, actorWallet: address(4), expectedPlanHash: hash(5), expectedState: 'ADVANCE_AVAILABLE', expectedCurrentStage: '0', stage: '0' }
const display = { snapshot: { context, campaignId: '7', checkpoint: { chainTimestamp: '10' }, campaign: { organizer: address(4), state: 'ADVANCE_AVAILABLE', currentStage: '0', planHash: hash(5), claimEnd: '11', custody: '2200000000' }, stages: [{ state: 'PENDING', advanced: '0', budget: '2200000000', latestVersion: '0', submissions: [] }] } }
const prepared = { context, actorWallet: address(4), contractAddress: address(1), functionName: 'claimAdvance', args: ['7', '0', hash(5)], recordHash: null, blockedReason: null }
const transaction = { from: address(4), to: address(1), value: 0n, input: encodeFunctionData({ abi, functionName: prepared.functionName, args: prepared.args }) }
function receipt() {
  const e = abi.find(x => x.type === 'event' && x.name === 'AdvanceClaimed')
  return { status: 'success', blockNumber: 9n, blockHash: hash(9), logs: [{ address: address(1),
    topics: encodeEventTopics({ abi, eventName: e.name, args: { campaignId: 7n, stage: 0n } }),
    data: encodeAbiParameters(e.inputs.filter(i => !i.indexed), [address(4), 2200000000n, 2200000000n, 0n, 100n, 200n]) }] }
}
test('intent is bound to the displayed action, actor, context, plan and stage', () => {
  assert.equal(advanceCall(input, prepared, display, deployment).functionName, 'claimAdvance')
  for (const change of [{ functionName: 'donate' }, { args: ['7', '1', hash(5)] }, { args: ['8', '0', hash(5)] }, { args: ['7', '0', hash(6)] },
    { actorWallet: address(5) }, { contractAddress: address(2) }, { context: { ...context, deploymentId: hash(6) } },
    { context: { ...context, chainId: 31337 } }, { context: {} }, { blockedReason: 'Review missing' }])
    assert.throws(() => advanceCall(input, { ...prepared, ...change }, display, deployment))
  assert.throws(() => advanceCall({ ...input, stage: '1' }, prepared, display, deployment))
  assert.throws(() => advanceCall({ ...input, expectedState: 'EXECUTING' }, prepared, display, deployment))
})
test('allowance must be exactly the displayed amount and configured token/spender', () => {
  const request = { ...input, action: 'DONATE', amount: '123' }
  const intent = { ...prepared, functionName: 'donate', args: ['7', '123'], approval: { tokenAddress: address(2), spender: address(1), amount: '123', allowance: '0' } }
  assert.equal(advanceCall(request, intent, display, deployment).functionName, 'donate')
  for (const change of [{ amount: '9999999999999999999999' }, { spender: address(5) }, { tokenAddress: address(5) }, { allowance: '123' }])
    assert.throws(() => advanceCall(request, { ...intent, approval: { ...intent.approval, ...change } }, display, deployment))
})
test('receipt requires success, exact calldata and one matching B event including amount/recipient', () => {
  assert.equal(verifyAdvanceReceipt(receipt(), transaction, input, prepared, display, deployment, abi), '7')
  for (const change of [{ status: 'reverted' }, { logs: [] }, { logs: [...receipt().logs, ...receipt().logs] },
    { logs: [{ ...receipt().logs[0], address: address(2) }] }])
    assert.throws(() => verifyAdvanceReceipt({ ...receipt(), ...change }, transaction, input, prepared, display, deployment, abi))
  for (const change of [{ from: address(5) }, { to: address(5) }, { input: '0x' }, { value: 1n }])
    assert.throws(() => verifyAdvanceReceipt(receipt(), { ...transaction, ...change }, input, prepared, display, deployment, abi))
  const altered = structuredClone(display); altered.snapshot.stages[0].budget = '1'
  assert.throws(() => verifyAdvanceReceipt(receipt(), transaction, input, prepared, altered, deployment, abi))
})
test('hash/receipt alone is not indexed; reorg, lag and rebuilding block completion', () => {
  const r = receipt(), indexed = { status: 'ready', lastIndexedBlock: '10', lastIndexedBlockHash: hash(8) }
  assert.equal(isAdvanceIndexed(r, hash(9), indexed, hash(8)), true)
  for (const state of [{ ...indexed, status: 'rebuilding' }, { ...indexed, lastIndexedBlock: '8' }, { ...indexed, lastIndexedBlockHash: hash(7) }])
    assert.equal(isAdvanceIndexed(r, hash(9), state, hash(8)), false)
  assert.equal(isAdvanceIndexed(r, hash(6), indexed, hash(8)), false)
})

test('refund receipt binds both base and supplement to displayed entitlements', () => {
  const request = { ...input, action: 'CLAIM_REFUND' }
  const intent = { ...prepared, functionName: 'claimRefund', args: ['7'] }
  const shown = { ...display, refund: { base: '0', supplement: '55000000' } }
  const tx = { ...transaction, input: encodeFunctionData({ abi, functionName: 'claimRefund', args: [7n] }) }
  const event = abi.find(x => x.type === 'event' && x.name === 'RefundClaimed')
  const r = { ...receipt(), logs: [{ address: address(1),
    topics: encodeEventTopics({ abi, eventName: event.name, args: { campaignId: 7n, donor: address(4) } }),
    data: encodeAbiParameters(event.inputs.filter(i => !i.indexed), [0n, 55000000n, true, 80000000n, 1260000000n, 0n]) }] }
  assert.equal(verifyAdvanceReceipt(r, tx, request, intent, shown, deployment, abi), '7')
  assert.throws(() => verifyAdvanceReceipt(r, tx, request, intent, display, deployment, abi))
  for (const refund of [{ base: '1', supplement: '55000000' }, { base: '0', supplement: '55000001' }])
    assert.throws(() => verifyAdvanceReceipt(r, tx, request, intent, { ...shown, refund }, deployment, abi))
})
test('pending transaction keys isolate users, wallets, networks, deployment, stage and action', () => {
  const key = advanceTrackingKey('user1', input, 'metadata', deployment)
  assert.notEqual(key, advanceTrackingKey('user2', input, 'metadata', deployment))
  for (const change of [{ actorWallet: address(6) }, { stage: '1' }, { action: 'RETURN_FUNDS' }, { context: { ...context, deploymentId: hash(7) } }])
    assert.notEqual(key, advanceTrackingKey('user1', { ...input, ...change }, 'metadata', deployment))
  assert.notEqual(key, advanceTrackingKey('user1', input, 'metadata', { ...deployment, deploymentBlockHash: hash(7) }))
  assert.notEqual(advanceTrackingKey('user1', { ...input, action: 'SUBMIT_EVIDENCE', packageId: 'v1' }, 'metadata', deployment),
    advanceTrackingKey('user1', { ...input, action: 'SUBMIT_EVIDENCE', packageId: 'v2' }, 'metadata', deployment))
})
test('advance gate rejects expired eligibility, no custody, duplicate advance and incomplete prior review/return/case', () => {
  const s = display.snapshot
  assert.equal(advanceClaimBlocked(s), undefined)
  for (const change of [{ state: 'FIRST_REVIEW' }, { claimEnd: '10' }, { custody: '2199999999' }])
    assert.ok(advanceClaimBlocked({ ...s, campaign: { ...s.campaign, ...change } }))
  assert.ok(advanceClaimBlocked({ ...s, stages: [{ ...s.stages[0], advanced: '2200000000' }] }))
  const prior = { state: 'FINALIZED', returned: '50', declaredUnused: '50', submissions: [] }
  const next = { ...s, campaign: { ...s.campaign, currentStage: '1' }, stages: [prior, s.stages[0]] }
  assert.equal(advanceClaimBlocked(next), undefined)
  for (const change of [{ state: 'CHALLENGE_WINDOW' }, { returned: '49' }, { submissions: [{ challengeCase: { caseUsed: true, resolution: 'PENDING' } }] }])
    assert.ok(advanceClaimBlocked({ ...next, stages: [{ ...prior, ...change }, s.stages[0]] }))
})
