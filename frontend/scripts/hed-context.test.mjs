import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDeploymentContext } from '../src/lib/web3/deployment-policy.ts'

const hed = { protocolKind: 'HED', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548', abiVersion: '1',
  abiHash: `0x${'1'.repeat(64)}`, policyHash: `0x${'2'.repeat(64)}`, backupResolver: `0x${'3'.repeat(40)}`,
  contractAddress: `0x${'4'.repeat(40)}`, tokenAddress: `0x${'5'.repeat(40)}`, resolver: `0x${'6'.repeat(40)}`,
  tokenDecimals: 6, confirmations: 1, genesisHash: `0x${'7'.repeat(64)}`, contractCodeHash: `0x${'8'.repeat(64)}`,
  tokenCodeHash: `0x${'9'.repeat(64)}`, deploymentBlockNumber: '1', deploymentBlockHash: `0x${'a'.repeat(64)}`,
  atomicSubmission: true }

test('HED UI mode accepts only the separate local chain and policy identity', () => {
  assert.equal(validateDeploymentContext(hed).chainId, 31339)
  assert.equal(validateDeploymentContext({ ...hed, rpcUrl: 'http://172.25.26.26:9548' }).rpcUrl, 'http://172.25.26.26:9548')
  for (const change of [{ chainId: 31338 }, { rpcUrl: 'http://127.0.0.1:9547' }, { policyHash: `0x${'0'.repeat(64)}` },
    { abiVersion: '2' }, { tokenDecimals: 18 }, { confirmations: 0 }]) {
    assert.throws(() => validateDeploymentContext({ ...hed, ...change }))
  }
})
