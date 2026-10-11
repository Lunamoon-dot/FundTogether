import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateDeploymentContext } from '../src/lib/web3/deployment-policy.ts'

const baseline = JSON.parse(fs.readFileSync(new URL('../../backend/src/blockchain/generated/deployment.local.json', import.meta.url)))
const hed = { ...baseline, protocolKind: 'HED', chainId: 31339, rpcUrl: 'http://127.0.0.1:9548', abiVersion: '1',
  abiHash: `0x${'1'.repeat(64)}`, policyHash: `0x${'2'.repeat(64)}`, backupResolver: `0x${'3'.repeat(40)}` }

test('HED UI mode accepts only the separate local chain and policy identity', () => {
  assert.equal(validateDeploymentContext(hed, 'HED').chainId, 31339)
  for (const change of [{ chainId: 31338 }, { rpcUrl: 'http://127.0.0.1:9547' }, { policyHash: `0x${'0'.repeat(64)}` },
    { abiVersion: '2' }, { tokenDecimals: 18 }, { confirmations: 0 }]) {
    assert.throws(() => validateDeploymentContext({ ...hed, ...change }, 'HED'))
  }
})
