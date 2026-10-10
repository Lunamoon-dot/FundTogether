import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { hexToString, verifyMessage } from 'viem'
import { signMessage } from 'viem/actions'
import { connect, disconnect, getAccount, getConnectorClient } from 'wagmi/actions'
import { createBrowserWalletConfig } from '../src/lib/web3/wallet-config.ts'
import { requestWalletProof } from '../src/lib/web3/wallet-proof.ts'

const chain = { id: 31338, name: 'Test B', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:9547'] } } }
const tick = () => new Promise(resolve => setImmediate(resolve))

async function fixture(run) {
  const previous = globalThis.window
  const browser = new EventTarget()
  globalThis.window = browser
  const signer = privateKeyToAccount(generatePrivateKey())
  class Provider extends EventEmitter {
    calls = []
    isMetaMask = true // Other extensions may also expose this compatibility flag.
    sign = text => signer.signMessage({ message: hexToString(text) })
    async request({ method, params }) {
      this.calls.push({ method, params })
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [signer.address]
      if (method === 'eth_chainId') return '0x7a6a'
      if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [signer.address] }] }]
      if (method === 'wallet_revokePermissions') return null
      if (method === 'personal_sign') return this.sign(params[0])
      throw new Error(`Unexpected method: ${method}`)
    }
  }
  const metamask = new Provider()
  const brave = new Provider()
  brave.isBraveWallet = true
  browser.ethereum = brave
  const details = [
    { info: { uuid: 'c7c562ea-0e0c-4a15-8a8c-d085ab280469', name: 'Brave Wallet', rdns: 'com.brave.wallet', icon: 'data:image/png;base64,AA==' }, provider: brave },
    { info: { uuid: '17aa148a-1559-4d05-a4e5-8fdd6fc3bb8c', name: 'MetaMask', rdns: 'io.metamask', icon: 'data:image/png;base64,AA==' }, provider: metamask },
  ]
  const announce = () => details.forEach(detail => browser.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })))
  browser.addEventListener('eip6963:requestProvider', announce)
  const config = createBrowserWalletConfig(chain, chain.rpcUrls.default.http[0])
  await tick()
  const connector = config.connectors.find(item => item.id === 'io.metamask')
  const proof = async () => {
    const active = getAccount(config)
    const expected = { address: active.address, chainId: active.chainId, connectorUid: active.connector?.uid, userId: 'resolver' }
    const client = await getConnectorClient(config, { connector, account: signer.address, chainId: chain.id })
    return requestWalletProof({ expected,
      current: () => { const state = getAccount(config); return { address: state.address, chainId: state.chainId, connectorUid: state.connector?.uid, userId: 'resolver' } },
      challenge: async () => ({ chainId: chain.id }), message: () => 'Proof for selected resolver account',
      sign: (message, account) => signMessage(client, { message, account }), timeoutMs: 1000 })
  }
  try { await run({ config, connector, metamask, brave, signer, proof, announce }) }
  finally { config._internal.mipd?.destroy(); globalThis.window = previous }
}

test('discovered MetaMask signs through its exact provider, not Brave or an SDK', async () => fixture(async h => {
  assert.deepEqual(h.config.connectors.map(c => c.id).sort(), ['com.brave.wallet', 'io.metamask'])
  assert.equal(h.connector.type, 'injected')
  assert.equal(await h.connector.getProvider(), h.metamask)
  h.announce()
  await tick()
  assert.equal(h.config.connectors.length, 2)
  await connect(h.config, { connector: h.connector })
  const result = await h.proof()
  assert.equal(await verifyMessage({ ...result, address: h.signer.address }), true)
  assert.equal(h.metamask.calls.filter(c => c.method === 'personal_sign').length, 1)
  assert.equal(h.brave.calls.length, 0)
}))

test('rejection followed by disconnect/reconnect sends one new request to MetaMask', async () => fixture(async h => {
  await connect(h.config, { connector: h.connector })
  const sign = h.metamask.sign
  h.metamask.sign = async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }) }
  await assert.rejects(h.proof())
  await disconnect(h.config, { connector: h.connector })
  await connect(h.config, { connector: h.connector })
  h.metamask.sign = sign
  assert.ok((await h.proof()).signature)
  assert.equal(h.metamask.calls.filter(c => c.method === 'personal_sign').length, 2)
  assert.equal(h.brave.calls.length, 0)
}))

test('switching accounts before the provider returns never verifies the old proof', async () => fixture(async h => {
  await connect(h.config, { connector: h.connector })
  let finish
  h.metamask.sign = () => new Promise(resolve => { finish = resolve })
  const rejected = assert.rejects(h.proof(), /đã thay đổi/)
  await tick()
  h.metamask.emit('accountsChanged', [`0x${'3'.repeat(40)}`])
  finish(await h.signer.signMessage({ message: 'Proof for selected resolver account' }))
  await rejected
}))
