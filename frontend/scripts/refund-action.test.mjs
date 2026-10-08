import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { assertRefundAction, readRefundSnapshot, verifyRefundReceipt } from '../src/lib/web3/refund-action.ts'

const abi = JSON.parse(readFileSync(new URL('../../backend/src/blockchain/generated/fund-together.abi.json', import.meta.url)))
const address = `0x${'1'.repeat(40)}`, organizer = `0x${'2'.repeat(40)}`, contract = `0x${'3'.repeat(40)}`, token = `0x${'4'.repeat(40)}`
const hash = `0x${'a'.repeat(64)}`
const campaign = { onchainCampaignId: '0', title: 'Refund fixture', tokenAddress: token, organizer, goalUnits: '100', fundingDeadline: 100 }
const defaults = { campaigns: [campaign.title, token, 100n, 100n, organizer, false, 0n, 100n], campaignState: 12,
  fundingDeadlines: 100n, refundSnapshotted: true, refundPool: 33n, contributions: 7n, claimedRefund: false, currentMilestoneIndex: 0n }
function reader(overrides = {}) {
  return { getBlock: async () => ({ number: 10n, hash, timestamp: 100n }), read: async name => ({ ...defaults, ...overrides })[name] }
}

test('partial refund uses integer floor and campaign ID zero; no floating point', async () => {
  const snapshot = await readRefundSnapshot(campaign, address, reader())
  assert.equal(snapshot.amount, 2n)
  assert.doesNotThrow(() => assertRefundAction('claimRefund', snapshot, address, organizer))
})
test('many donations accumulated by contract receive one entitlement', async () => {
  const snapshot = await readRefundSnapshot(campaign, address, reader({ contributions: 30n, refundPool: 100n }))
  assert.equal(snapshot.amount, 30n)
})

test('large refund amounts retain precision even when contribution times pool exceeds uint256', async () => {
  const pool = 1n << 200n, total = 2n * pool, contribution = pool / 3n
  const largeCampaign = { ...campaign, goalUnits: total.toString() }
  const snapshot = await readRefundSnapshot(largeCampaign, address, reader({
    campaigns: [campaign.title, token, total, pool, organizer, false, 0n, total],
    contributions: contribution, refundPool: pool,
  }))
  assert.equal(snapshot.amount, contribution / 2n)
})

test('many donor entitlements conserve the pool and bound dust in token base units', async () => {
  for (let count = 2; count <= 32; count++) {
    const weights = Array.from({ length: count }, (_, i) => BigInt(i + 1))
    const total = weights.reduce((sum, value) => sum + value, 0n)
    for (const pool of [1n, total / 3n, total]) {
      let sum = 0n
      for (const contribution of weights) {
        const snapshot = await readRefundSnapshot({ ...campaign, goalUnits: total.toString() }, address, reader({
          campaigns: [campaign.title, token, total, total, organizer, false, 0n, total],
          contributions: contribution, refundPool: pool,
        }))
        assert.equal(snapshot.amount, contribution * pool / total)
        sum += snapshot.amount
      }
      assert.ok(sum <= pool)
      assert.ok(pool - sum < BigInt(count))
      if (pool === total) assert.equal(sum, total)
    }
  }
})
test('zero rounded refund stays eligible but non-contributor and claimed wallet cannot claim', async () => {
  const zero = await readRefundSnapshot(campaign, address, reader({ refundPool: 1n, contributions: 1n }))
  assert.equal(zero.amount, 0n)
  assert.doesNotThrow(() => assertRefundAction('claimRefund', zero, address, organizer))
  for (const overrides of [{ contributions: 0n }, { claimedRefund: true }, { refundSnapshotted: false }]) {
    const snapshot = await readRefundSnapshot(campaign, address, reader(overrides))
    assert.throws(() => assertRefundAction('claimRefund', snapshot, address, organizer))
  }
})
test('funding failure opens at exact chain deadline, never while funded', async () => {
  const short = { ...campaign, goalUnits: '101' }
  const snapshot = await readRefundSnapshot(short, address, reader({ campaigns: [campaign.title, token, 101n, 100n, organizer, true, 100n, 100n], campaignState: 2 }))
  assert.doesNotThrow(() => assertRefundAction('finalizeFundingFailure', snapshot, address, organizer))
  assert.throws(() => assertRefundAction('finalizeFundingFailure', { ...snapshot, canFinalize: false }, address, organizer))
  assert.throws(() => assertRefundAction('cancelCampaign', { ...snapshot, state: 3 }, organizer, organizer))
  assert.throws(() => assertRefundAction('cancelCampaign', snapshot, address, organizer))
})
test('foreign token, organizer, goal and changed canonical block stop signing', async () => {
  for (const index of [1, 2, 4]) {
    const record = [...defaults.campaigns]; record[index] = index === 2 ? 101n : contract
    await assert.rejects(readRefundSnapshot(campaign, address, reader({ campaigns: record })), /không khớp/)
  }
  const source = reader(); source.getBlock = async options => ({ number: 10n, hash: options.blockNumber ? `0x${'b'.repeat(64)}` : hash, timestamp: 100n })
  await assert.rejects(readRefundSnapshot(campaign, address, source), /Block đã thay đổi/)
})
test('milestone timeout uses current index and exact chain deadline only in supported states', async () => {
  for (const state of [3, 6, 9]) {
    const snapshot = await readRefundSnapshot(campaign, address, reader({ campaignState: state, activationDeadlines: 100n, evidenceDeadlines: 100n, currentMilestoneIndex: 1n }))
    assert.equal(snapshot.milestoneIndex, 1n)
    assert.doesNotThrow(() => assertRefundAction('finalizeMilestoneTimeout', snapshot, address, organizer))
  }
  for (const overrides of [{ campaignState: 3, activationDeadlines: 101n }, { campaignState: 8 }, { campaignState: 11 }, { campaignState: 3, activationDeadlines: 0n }]) {
    const snapshot = await readRefundSnapshot(campaign, address, reader(overrides))
    assert.throws(() => assertRefundAction('finalizeMilestoneTimeout', snapshot, address, organizer))
  }
})
function receipt(donor = address, amount = 2n, id = 0n, emitter = contract) {
  return { status: 'success', logs: [{ address: emitter, data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
    topics: encodeEventTopics({ abi, eventName: 'RefundClaimed', args: { campaignId: id, donor } }) }] }
}
test('receipt must match exact contract, campaign, recipient and amount', () => {
  assert.doesNotThrow(() => verifyRefundReceipt('claimRefund', receipt(), abi, contract, '0', address, '2'))
  for (const wrong of [receipt(organizer), receipt(address, 3n), receipt(address, 2n, 1n), receipt(address, 2n, 0n, token), { status: 'reverted', logs: [] }, { status: 'success', logs: [] }])
    assert.throws(() => verifyRefundReceipt('claimRefund', wrong, abi, contract, '0', address, '2'))
})
test('milestone failure receipt must match its current milestone index', () => {
  const failed = { status: 'success', logs: [{ address: contract, data: encodeAbiParameters([{ type: 'uint8' }], [0]),
    topics: encodeEventTopics({ abi, eventName: 'CampaignFailed', args: { campaignId: 0n, milestoneIndex: 1n } }) }] }
  assert.doesNotThrow(() => verifyRefundReceipt('finalizeMilestoneTimeout', failed, abi, contract, '0', address, '0', '1'))
  assert.throws(() => verifyRefundReceipt('finalizeMilestoneTimeout', failed, abi, contract, '0', address, '0', '0'))
})
