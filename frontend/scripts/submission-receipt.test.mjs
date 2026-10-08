import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitForSubmissionReceipt } from '../src/lib/web3/submission-receipt.ts'

const hash = `0x${'a'.repeat(64)}`
const replacement = `0x${'b'.repeat(64)}`
function setup() {
  let stored = hash
  return { get stored() { return stored }, dependencies: {
    wait: async () => ({ status: 'success' }), savePending: value => { stored = value }, clearPending: () => { stored = null },
  } }
}
test('confirmed submission clears its pending receipt', async () => {
  const h = setup(); await waitForSubmissionReceipt(hash, h.dependencies); assert.equal(h.stored, null)
})
test('receipt timeout retains original hash for reconciliation', async () => {
  const h = setup(); h.dependencies.wait = async () => { throw new Error('RPC timeout') }
  await assert.rejects(waitForSubmissionReceipt(hash, h.dependencies), /RPC timeout/)
  assert.equal(h.stored, hash)
})
test('speed-up hash is retained when waiting times out', async () => {
  const h = setup(); h.dependencies.wait = async (_, onReplaced) => {
    onReplaced({ reason: 'repriced', transaction: { hash: replacement } }); throw new Error('RPC timeout')
  }
  await assert.rejects(waitForSubmissionReceipt(hash, h.dependencies), /RPC timeout/)
  assert.equal(h.stored, replacement)
})
test('wallet cancellation with a successful receipt never reports submission success', async () => {
  const h = setup(); h.dependencies.wait = async (_, onReplaced) => {
    onReplaced({ reason: 'cancelled', transaction: { hash: replacement } }); return { status: 'success' }
  }
  await assert.rejects(waitForSubmissionReceipt(hash, h.dependencies), /đã hủy/)
  assert.equal(h.stored, null)
})
test('reverted receipt clears hash and reports failure', async () => {
  const h = setup(); h.dependencies.wait = async () => ({ status: 'reverted' })
  await assert.rejects(waitForSubmissionReceipt(hash, h.dependencies), /revert/)
  assert.equal(h.stored, null)
})
