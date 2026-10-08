import assert from 'node:assert/strict'
import { test } from 'node:test'

const implementation = await import('../src/lib/web3/campaign-action.ts').catch(() => null)
const hash = `0x${'a'.repeat(64)}`

function setup(state = 0, pending = null) {
  const calls = []
  let stored = pending
  return {
    calls,
    get stored() { return stored },
    dependencies: {
      readState: async () => { calls.push('read'); return state },
      authorize: async () => {},
      send: async () => { calls.push('send'); state = 1; return hash },
      wait: async () => { calls.push('wait'); state = 1; return { status: 'success', blockNumber: 20n } },
      loadPending: () => stored,
      savePending: (value) => { calls.push('save'); stored = value },
      clearPending: () => { calls.push('clear'); stored = null },
    },
  }
}

test('campaign action implementation exists', () => {
  assert.ok(implementation, 'Missing shared wallet transaction lifecycle')
})

test('reads current chain state before signing and preserves receipt until indexed', async () => {
  const harness = setup()
  const result = await implementation.runCampaignAction('approve', harness.dependencies)
  assert.equal(result.receiptBlock, 20n)
  assert.equal(harness.stored, hash)
  assert.ok(harness.calls.indexOf('read') < harness.calls.indexOf('send'))
  assert.ok(harness.calls.indexOf('save') < harness.calls.indexOf('wait'))
})

test('resumes saved transaction without requesting a second signature', async () => {
  const harness = setup(0, hash)
  await implementation.runCampaignAction('approve', harness.dependencies)
  assert.equal(harness.calls.filter(value => value === 'send').length, 0)
  assert.ok(harness.calls.includes('wait'))
})

test('completed matching state reconciles an old orphaned hash without waiting forever', async () => {
  const harness = setup(1, hash)
  harness.dependencies.wait = async () => { throw new Error('orphaned receipt') }
  await implementation.runCampaignAction('approve', harness.dependencies)
  assert.equal(harness.calls.includes('send'), false)
  assert.equal(harness.calls.includes('wait'), false)
})

test('already published chain state suppresses signing even without local hash', async () => {
  const harness = setup(2)
  await implementation.runCampaignAction('publish', harness.dependencies)
  assert.equal(harness.calls.filter(value => value === 'send').length, 0)
})

test('RPC timeout retains pending transaction and prevents another send on retry', async () => {
  const harness = setup(0, hash)
  harness.dependencies.wait = async () => { throw new Error('RPC timeout') }
  await assert.rejects(() => implementation.runCampaignAction('approve', harness.dependencies), /RPC timeout/)
  assert.equal(harness.stored, hash)
  assert.equal(harness.calls.filter(value => value === 'send').length, 0)
})

test('a reverted receipt clears pending identity and reports failure', async () => {
  const harness = setup(0, hash)
  harness.dependencies.wait = async () => ({ status: 'reverted', blockNumber: 20n })
  await assert.rejects(() => implementation.runCampaignAction('approve', harness.dependencies), /revert/)
  assert.equal(harness.stored, null)
})

test('a wallet cancellation clears pending identity and reports cancellation', async () => {
  const harness = setup(0, hash)
  harness.dependencies.wait = async () => ({ status: 'cancelled', blockNumber: 20n })
  await assert.rejects(() => implementation.runCampaignAction('approve', harness.dependencies), /đã hủy/)
  assert.equal(harness.stored, null)
})

test('unapproved and cancelled campaigns cannot publish or imply approval', async () => {
  for (const [action, state] of [['publish', 0], ['publish', 5], ['approve', 5]]) {
    const harness = setup(state)
    await assert.rejects(() => implementation.runCampaignAction(action, harness.dependencies), /trạng thái/)
    assert.equal(harness.calls.includes('send'), false)
  }
})

test('indexing must match action and include the receipt block', () => {
  assert.equal(implementation.isCampaignActionIndexed('publish', { state: 'FUNDING', indexedBlock: '19' }, 20n), false)
  assert.equal(implementation.isCampaignActionIndexed('publish', { state: 'APPROVED', indexedBlock: '20' }, 20n), false)
  assert.equal(implementation.isCampaignActionIndexed('publish', { state: 'FUNDING', indexedBlock: '20' }, 20n), true)
  assert.equal(implementation.isCampaignActionIndexed('approve', { state: 'APPROVED', indexedBlock: null }), false)
})

test('cancellation waits for CANCELLED and suppresses duplicate signatures', async () => {
  const harness = setup(5, hash)
  await implementation.runCampaignAction('cancel', harness.dependencies)
  assert.equal(harness.calls.includes('send'), false)
  assert.equal(harness.calls.includes('wait'), false)
  assert.equal(implementation.isCampaignActionIndexed('cancel', { state: 'FUNDING', indexedBlock: '20' }), false)
  assert.equal(implementation.isCampaignActionIndexed('cancel', { state: 'CANCELLED', indexedBlock: '19' }, 20n), false)
  assert.equal(implementation.isCampaignActionIndexed('cancel', { state: 'CANCELLED', indexedBlock: '20' }, 20n), true)
})

test('cancellation does not mistake published state for completion', async () => {
  const harness = setup(2)
  await assert.rejects(() => implementation.runCampaignAction('cancel', harness.dependencies), /trạng thái chưa khớp/)
  assert.equal(harness.calls.includes('send'), true)
})

const plan = {
  chainId: 31337, contractAddress: `0x${'1'.repeat(40)}`, tokenAddress: `0x${'2'.repeat(40)}`, organizer: `0x${'3'.repeat(40)}`,
  genesisHash: hash, contractCodeHash: hash, tokenCodeHash: hash, confirmations: 1, draftKey: `0x${'b'.repeat(64)}`,
  title: 'Frozen plan', fundingDeadline: 1900000000, budgetUnits: ['10', '20'], criteriaHashes: [`0x${'c'.repeat(64)}`, `0x${'d'.repeat(64)}`], goalUnits: '30', bondUnits: '20',
}
const identity = { plan, onchainCampaignId: '4', actor: plan.organizer }

function snapshotReader(overrides = {}) {
  const reads = []
  return {
    reads,
    getBlock: async () => ({ number: 10n, hash }),
    read: async (name, args, blockNumber) => {
      reads.push({ name, blockNumber })
      if (overrides[name] !== undefined) return overrides[name]
      if (name === 'campaignForDraft') return 5n
      if (name === 'campaigns') return [plan.title, plan.tokenAddress, 30n, 20n, plan.organizer, true, 20n, 0n]
      if (name === 'fundingDeadlines') return BigInt(plan.fundingDeadline)
      if (name === 'milestoneCount') return 2n
      if (name === 'campaignState') return 0
      if (name === 'resolver') return identity.actor
      if (name === 'milestones') return [BigInt(plan.budgetUnits[Number(args[1])]), 0]
      if (name === 'milestoneCriteria') return plan.criteriaHashes[Number(args[1])]
      throw new Error(`Unexpected read ${name}`)
    },
  }
}

test('fresh campaign ID Y against cached ID X prevents any wallet signature', async () => {
  const harness = setup()
  harness.dependencies.authorize = async () => implementation.assertCampaignActionIdentity(identity, { ...identity, onchainCampaignId: '7' })
  await assert.rejects(() => implementation.runCampaignAction('approve', harness.dependencies), /đã thay đổi/)
  assert.equal(harness.calls.includes('send'), false)
})

test('fresh frozen plan changes prevent signing', () => {
  assert.throws(() => implementation.assertCampaignActionIdentity(identity, { ...identity, plan: { ...plan, criteriaHashes: [hash, hash] } }), /đã thay đổi/)
})

test('deployment block is part of a pending action identity', () => {
  const anchored = { ...identity, plan: { ...plan, deploymentBlockNumber: '2', deploymentBlockHash: hash } }
  assert.throws(() => implementation.assertCampaignActionIdentity(identity, anchored), /đã thay đổi/)
  assert.throws(() => implementation.assertCampaignActionIdentity(anchored,
    { ...anchored, plan: { ...anchored.plan, deploymentBlockHash: plan.draftKey } }), /đã thay đổi/)
})

test('full campaign snapshot reads every field and criterion at the same latest block', async () => {
  const reader = snapshotReader()
  const result = await implementation.verifyCampaignActionSnapshot(identity, 'approve', reader)
  assert.equal(result.state, 0)
  assert.ok(reader.reads.every(item => item.blockNumber === 10n))
  assert.equal(reader.reads.filter(item => item.name === 'milestoneCriteria').length, 2)
})

test('reorg mapping to a different ID aborts the latest chain snapshot', async () => {
  await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', snapshotReader({ campaignForDraft: 8n })), /không khớp/)
})

test('approval requires the full locked bond and matching frozen criteria', async () => {
  const unbonded = [plan.title, plan.tokenAddress, 30n, 20n, plan.organizer, false, 0n, 0n]
  await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', snapshotReader({ campaigns: unbonded })), /bond/)
  await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', snapshotReader({ milestoneCriteria: hash })), /Tiêu chí/)
})

test('campaign accounting, organizer, deadline and milestone budgets must match the frozen plan', async () => {
  const canonical = [plan.title, plan.tokenAddress, 30n, 20n, plan.organizer, true, 20n, 0n]
  const tupleChanges = [[0, 'Other title'], [1, `0x${'9'.repeat(40)}`], [2, 31n], [3, 19n], [4, `0x${'8'.repeat(40)}`]]
  for (const [index, value] of tupleChanges) {
    const changed = [...canonical]; changed[index] = value
    await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', snapshotReader({ campaigns: changed })), /khớp/)
  }
  for (const overrides of [{ fundingDeadlines: 1n }, { milestoneCount: 3n }, { milestones: [99n, 0] }]) {
    await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', snapshotReader(overrides)), /khớp/)
  }
})

test('block hash change during snapshot aborts before simulation or signing', async () => {
  const reader = snapshotReader()
  reader.getBlock = async options => ({ number: 10n, hash: options.blockNumber === undefined ? hash : `0x${'f'.repeat(64)}` })
  await assert.rejects(() => implementation.verifyCampaignActionSnapshot(identity, 'approve', reader), /Block đã thay đổi/)
})
