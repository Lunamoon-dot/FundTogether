import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertAdvanceArtifacts, validateDeploymentContext } from '../src/lib/web3/deployment-policy.ts'
import { keccak256, toHex } from 'viem'
const baseline = JSON.parse(fs.readFileSync(new URL('../../backend/src/blockchain/generated/deployment.local.json', import.meta.url)))
const advance = { ...baseline, protocolKind: 'ADVANCE', chainId: 31338, rpcUrl: 'http://127.0.0.1:9547',
  abiVersion: '1', workflowPolicy: `0x${'1'.repeat(64)}`, abiHash: `0x${'2'.repeat(64)}`, policyHash: `0x${'3'.repeat(64)}` }
test('selects A and B only with their own chain/RPC and typed deployment anchor', () => {
  assert.equal(validateDeploymentContext(baseline, 'BASELINE').chainId, 31337)
  assert.equal(validateDeploymentContext(advance, 'ADVANCE').chainId, 31338)
  assert.throws(() => validateDeploymentContext(baseline, 'ADVANCE'))
  assert.throws(() => validateDeploymentContext(advance, 'BASELINE'))
  for (const change of [{ chainId: 31337 }, { rpcUrl: baseline.rpcUrl }, { workflowPolicy: `0x${'0'.repeat(64)}` },
    { deploymentId: undefined }, { abiVersion: '2' }, { deploymentBlockHash: '0x' }, { tokenDecimals: 18 }, { confirmations: 0 }])
    assert.throws(() => validateDeploymentContext({ ...advance, ...change }, 'ADVANCE'))
})
test('B manifest commits to the exact generated ABI and policy bytes', () => {
  const abi = JSON.parse(fs.readFileSync(new URL('../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json', import.meta.url)))
  const policy = JSON.parse(fs.readFileSync(new URL('../../backend/src/blockchain/generated/advance/policy.json', import.meta.url)))
  const digest = v => keccak256(toHex(JSON.stringify(v, null, 2) + '\n'))
  const manifest = { ...advance, abiHash: digest(abi), policyHash: digest(policy), workflowPolicy: keccak256(toHex('FundTogether.advance.no-bond.v1')) }
  assert.doesNotThrow(() => assertAdvanceArtifacts(manifest, abi, policy))
  assert.throws(() => assertAdvanceArtifacts(manifest, abi.slice(1), policy))
  assert.throws(() => assertAdvanceArtifacts(manifest, abi, { ...policy, MAX_VERSIONS: 4 }))
  assert.throws(() => assertAdvanceArtifacts({ ...manifest, workflowPolicy: advance.workflowPolicy }, abi, policy))
})
