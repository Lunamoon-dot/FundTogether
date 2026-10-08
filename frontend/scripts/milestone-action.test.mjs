import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { milestoneCallArgs, matchesMilestoneReceipt } from '../src/lib/web3/milestone-action.ts'

const abi = JSON.parse(readFileSync(new URL('../../backend/src/blockchain/generated/fund-together-mvp.abi.json', import.meta.url)))
const contract = `0x${'1'.repeat(40)}`, wallet = `0x${'2'.repeat(40)}`, reasonHash = `0x${'3'.repeat(64)}`
const settle = { functionName: 'settleMilestoneForVersion', args: ['0', '1', '2', reasonHash], event: 'MilestoneSettled', contractAddress: contract, wallet,
  expected: { campaignId: '0', milestoneIndex: '1', amount: '2000000' } }
function log(event, args) {
  const spec = abi.find(e => e.type === 'event' && e.name === event)
  return { address: contract, topics: encodeEventTopics({ abi, eventName: event, args }),
    data: encodeAbiParameters(spec.inputs.filter(i => !i.indexed), spec.inputs.filter(i => !i.indexed).map(i => args[i.name])) }
}
function receipt(call, args) { return { status: 'success', to: contract, from: wallet, logs: [log(call.event, args)] } }
test('MVP calls preserve campaign ID zero and never accept a different entrypoint or target', () => {
  assert.deepEqual(milestoneCallArgs(abi, 'settle', settle, '0', '1'), [0n, 1n, 2n, reasonHash])
  for (const patch of [{ functionName: 'claimRefund' }, { args: ['2', '1'] }, { args: ['0', '2'] }, { args: ['0'] }])
    assert.throws(() => milestoneCallArgs(abi, 'settle', { ...settle, ...patch }, '0', '1'))
})
test('settlement receipt checks signer, contract, exact campaign, milestone and amount', () => {
  const r = receipt(settle, { campaignId: 0n, milestoneIndex: 1n, amount: 2000000n })
  assert.equal(matchesMilestoneReceipt(r, abi, settle), true)
  for (const patch of [{ status: 'reverted' }, { from: contract }, { to: wallet }, { logs: [{ ...r.logs[0], address: wallet }] },
    { logs: [log('MilestoneSettled', { campaignId: 1n, milestoneIndex: 1n, amount: 2000000n })] },
    { logs: [log('MilestoneSettled', { campaignId: 0n, milestoneIndex: 2n, amount: 2000000n })] },
    { logs: [log('MilestoneSettled', { campaignId: 0n, milestoneIndex: 1n, amount: 1n })] }])
    assert.equal(matchesMilestoneReceipt({ ...r, ...patch }, abi, settle), false)
})
test('challenge uses donor event field and must bind the public reason commitment', () => {
  const call = { ...settle, event: 'ChallengeOpened', expected: { campaignId: '0', milestoneIndex: '1', donor: wallet, reasonHash } }
  const r = receipt(call, { campaignId: 0n, milestoneIndex: 1n, donor: wallet, reasonHash })
  assert.equal(matchesMilestoneReceipt(r, abi, call), true)
  assert.equal(matchesMilestoneReceipt(r, abi, { ...call, expected: { ...call.expected, reasonHash: `0x${'4'.repeat(64)}` } }), false)
})
test('timeout receipt needs the exact pinned evidence version and timeout verdict', () => {
  const call = { ...settle, event: 'ChallengeResolved', expected: { campaignId: '0', milestoneIndex: '1', version: '2', resolution: '4' } }
  const args = { campaignId: 0n, milestoneIndex: 1n, version: 2n, caller: wallet, resolution: 4, evidenceHash: reasonHash, reasonHash }
  assert.equal(matchesMilestoneReceipt(receipt(call, args), abi, call), true)
  for (const patch of [{ version: 1n }, { resolution: 1 }]) assert.equal(matchesMilestoneReceipt(receipt(call, { ...args, ...patch }), abi, call), false)
})
test('version-bound challenge receipt also verifies donor and the public reason', () => {
  const call = { ...settle, event: 'ChallengeCaseOpened', expected: { campaignId: '0', milestoneIndex: '1', version: '2', evidenceHash: reasonHash },
    proof: { event: 'ChallengeOpened', expected: { campaignId: '0', milestoneIndex: '1', donor: wallet, reasonHash } } }
  const r = receipt(call, { campaignId: 0n, milestoneIndex: 1n, version: 2n, evidenceHash: reasonHash, responseDeadline: 100n, resolutionDeadline: 200n })
  assert.equal(matchesMilestoneReceipt(r, abi, call), false)
  const opened = log('ChallengeOpened', { campaignId: 0n, milestoneIndex: 1n, donor: wallet, reasonHash })
  assert.equal(matchesMilestoneReceipt({ ...r, logs: [...r.logs, opened] }, abi, call), true)
  assert.equal(matchesMilestoneReceipt({ ...r, logs: [...r.logs, opened] }, abi, { ...call, expected: { ...call.expected, version: '1' } }), false)
  assert.equal(matchesMilestoneReceipt({ ...r, logs: [...r.logs, opened] }, abi, { ...call,
    proof: { ...call.proof, expected: { ...call.proof.expected, reasonHash: `0x${'4'.repeat(64)}` } } }), false)
})
