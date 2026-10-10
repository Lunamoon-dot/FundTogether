import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestWalletProof } from '../src/lib/web3/wallet-proof.ts'
import { assertWalletRequestAvailable, requestWalletConfirmation } from '../src/lib/web3/wallet-confirmation.ts'
import { verifyWalletDeployment } from '../src/lib/web3/wallet-identity.ts'
import { keccak256 } from 'viem'

const address = `0x${'1'.repeat(40)}`
const signature = `0x${'2'.repeat(130)}`
function setup() {
  let active = { address, chainId: 31337, userId: 'organizer' }
  const calls = []
  return { calls, change: value => { active = { ...active, ...value } }, dependencies: {
    expected: { ...active }, current: () => active,
    challenge: async () => ({ chainId: 31337 }), message: () => 'SIWE message',
    sign: async (message, account) => { calls.push({ message, account }); return signature }, timeoutMs: 20,
  } }
}

test('wallet proof signs with the explicit selected address', async () => {
  const h = setup()
  const stages = []
  assert.deepEqual(await requestWalletProof({ ...h.dependencies, onStage: stage => stages.push(stage) }), { message: 'SIWE message', signature })
  assert.equal(h.calls[0].account, address)
  assert.deepEqual(stages, ['challenge', 'signature'])
})
test('wrong challenge chain is rejected before signing', async () => {
  const h = setup(); h.dependencies.challenge = async () => ({ chainId: 1 })
  await assert.rejects(requestWalletProof(h.dependencies), /31337|chain ID 1/)
  assert.equal(h.calls.length, 0)
})
test('wallet switched while loading nonce never signs', async () => {
  const h = setup(); h.dependencies.challenge = async () => { h.change({ address: `0x${'3'.repeat(40)}` }); return { chainId: 31337 } }
  await assert.rejects(requestWalletProof(h.dependencies), /đã thay đổi/)
  assert.equal(h.calls.length, 0)
})
for (const change of [{ address: undefined }, { chainId: 1 }, { userId: 'resolver' }]) {
  test(`identity changed during signing is rejected (${JSON.stringify(change)})`, async () => {
    const h = setup(); h.dependencies.sign = async () => { h.change(change); return signature }
    await assert.rejects(requestWalletProof(h.dependencies), /đã thay đổi/)
  })
}
test('timed out wallet proof stays locked until a late signature settles', async () => {
  const h = setup(); let finish
  h.dependencies.sign = () => new Promise(resolve => { finish = resolve })
  let linked = false
  try {
    await assert.rejects(requestWalletProof(h.dependencies).then(() => { linked = true }), /Ví chưa trả chữ ký/)
    assert.throws(() => assertWalletRequestAvailable(address), /yêu cầu xác nhận chưa xử lý/)
    await assert.rejects(requestWalletProof({ ...h.dependencies, sign: async () => signature }), /yêu cầu xác nhận chưa xử lý/)
    finish(signature)
    await new Promise(resolve => setImmediate(resolve))
    const retry = await requestWalletProof({ ...h.dependencies, sign: async () => signature })
    assert.equal(retry.signature, signature)
  } finally {
    finish?.(signature)
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(linked, false)
})

test('cancelled proof stays locked until the wallet settles its uncancellable request', async () => {
  const h = setup()
  const controller = new AbortController()
  let finishOld, finishNew
  let oldLinked = false
  const old = requestWalletProof({ ...h.dependencies, signal: controller.signal,
    sign: () => new Promise(resolve => { finishOld = resolve }) }).then(() => { oldLinked = true })
  await new Promise(resolve => setImmediate(resolve))
  const cancelled = assert.rejects(old, /cancelled/)
  controller.abort(new Error('cancelled'))
  await cancelled
  assert.throws(() => assertWalletRequestAvailable(address), /yêu cầu xác nhận chưa xử lý/)
  await assert.rejects(requestWalletProof(h.dependencies), /yêu cầu xác nhận chưa xử lý/)
  finishOld(signature)
  await new Promise(resolve => setImmediate(resolve))
  const next = requestWalletProof({ ...h.dependencies, timeoutMs: 1000,
    sign: () => new Promise(resolve => { finishNew = resolve }) })
  await new Promise(resolve => setImmediate(resolve))
  finishNew(signature)
  assert.equal((await next).signature, signature)
  assert.equal(oldLinked, false)
  assert.doesNotThrow(() => assertWalletRequestAvailable(address))
})

test('active proof still prevents duplicate signing requests', async () => {
  const h = setup(); let finish
  const first = requestWalletProof({ ...h.dependencies, timeoutMs: 1000,
    sign: () => new Promise(resolve => { finish = resolve }) })
  await new Promise(resolve => setImmediate(resolve))
  try { await assert.rejects(requestWalletProof(h.dependencies), /yêu cầu xác nhận chưa xử lý/) }
  finally { finish(signature); await first }
})

test('provider pending error does not leave a frontend proof lock', async () => {
  const h = setup()
  await assert.rejects(requestWalletProof({ ...h.dependencies,
    sign: async () => { throw Object.assign(new Error('provider request pending'), { code: -32002 }) } }), /provider request pending/)
  assert.equal((await requestWalletProof(h.dependencies)).signature, signature)
})

test('transaction timeout retains its lock and records the late transaction hash', async () => {
  let finish
  const observed = []
  const uid = 'transaction-connector'
  await assert.rejects(requestWalletConfirmation({ connectorUid: uid, timeoutMs: 5,
    request: () => new Promise(resolve => { finish = resolve }),
    onResult: (hash, late) => observed.push({ hash, late }) }), /Ví không phản hồi/)
  assert.throws(() => assertWalletRequestAvailable(uid), /yêu cầu xác nhận chưa xử lý/)
  finish('0xtx')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(observed, [{ hash: '0xtx', late: true }])
  assert.doesNotThrow(() => assertWalletRequestAvailable(uid))
})
test('user rejection propagates without a valid proof', async () => {
  const h = setup(); h.dependencies.sign = async () => { throw new Error('User rejected') }
  await assert.rejects(requestWalletProof(h.dependencies), /User rejected/)
})

test('wallet deployment rejects a reused address when the deployment block changed', async () => {
  const genesisHash = `0x${'a'.repeat(64)}`, anchorHash = `0x${'b'.repeat(64)}`
  const reader = { getChainId: async () => 31337, getCode: async () => '0x01',
    getBlock: async ({ blockNumber }) => ({ hash: blockNumber === 0n ? genesisHash : anchorHash }) }
  const wallet = { extend: () => reader }
  const plan = { chainId: 31337, contractAddress: address, tokenAddress: address, genesisHash,
    contractCodeHash: keccak256('0x01'), tokenCodeHash: keccak256('0x01'),
    deploymentBlockNumber: '2', deploymentBlockHash: anchorHash }
  await verifyWalletDeployment(wallet, plan)
  await assert.rejects(verifyWalletDeployment(wallet, { ...plan, deploymentBlockHash: genesisHash }), /deployment/)
  await assert.rejects(verifyWalletDeployment(wallet, { ...plan, deploymentBlockHash: undefined }), /thiếu mốc/)
})
