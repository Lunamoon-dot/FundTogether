// Read-only verification of F2 against the isolated Workflow B deployment.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { validateDeploymentContext, assertAdvanceArtifacts } from '../src/lib/web3/deployment-policy.ts'
import { advanceCall, verifyAdvanceReceipt, verifyAdvanceWallet } from '../src/lib/web3/advance-action.ts'
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const manifest = read('../../.local/workflow-b/generated/deployment.local.json')
const deployment = validateDeploymentContext(manifest, 'ADVANCE')
const abi = read('../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json')
assertAdvanceArtifacts(deployment, abi, read('../../backend/src/blockchain/generated/advance/policy.json'))
const client = createPublicClient({ transport: http(deployment.rpcUrl) })
const wallet = createWalletClient({ account: deployment.resolver, transport: http(deployment.rpcUrl) })
await verifyAdvanceWallet(wallet, deployment)
const fakeCode = createWalletClient({ transport: custom({ request: ({ method, params }) => method === 'eth_getCode' ? Promise.resolve('0x00') : client.request({ method, params }) }) })
await assert.rejects(verifyAdvanceWallet(fakeCode, deployment), /deployment/)
const logs = await client.getContractEvents({ address: deployment.contractAddress, abi, eventName: 'AdvanceClaimed', fromBlock: BigInt(deployment.deploymentBlockNumber), toBlock: 'latest', strict: true })
assert.ok(logs.length > 0, 'Seeded B advance receipt required')
const log = logs.at(-1), blockNumber = log.blockNumber - 1n
const [c, s, block, receipt, tx] = await Promise.all([
  client.readContract({ address: deployment.contractAddress, abi, functionName: 'campaign', args: [log.args.campaignId], blockNumber }),
  client.readContract({ address: deployment.contractAddress, abi, functionName: 'stage', args: [log.args.campaignId, log.args.stage], blockNumber }),
  client.getBlock({ blockNumber }), client.getTransactionReceipt({ hash: log.transactionHash }), client.getTransaction({ hash: log.transactionHash }),
])
assert.equal(Number(c.state), 4); assert.equal(log.args.stage, 0n)
const strings = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v))
const context = Object.fromEntries(['protocolKind', 'chainId', 'deploymentId', 'contractAddress', 'tokenAddress', 'resolver', 'workflowPolicy', 'abiVersion', 'confirmations'].map(k => [k, deployment[k]]))
const checkpoint = { blockNumber: block.number.toString(), blockHash: block.hash, chainTimestamp: block.timestamp.toString() }
const snapshot = { context, checkpoint, campaignId: log.args.campaignId.toString(), campaign: { ...strings(c), state: 'ADVANCE_AVAILABLE' }, stages: [{ ...strings(s), state: 'PENDING', submissions: [] }] }
const input = { action: 'CLAIM_ADVANCE', context, actorWallet: c.organizer, expectedPlanHash: c.planHash, expectedState: 'ADVANCE_AVAILABLE', expectedCurrentStage: '0', stage: '0', expectedCheckpoint: checkpoint }
const prepared = { context, checkpoint, actorWallet: c.organizer, contractAddress: deployment.contractAddress, functionName: 'claimAdvance', args: [snapshot.campaignId, '0', c.planHash], recordHash: null, blockedReason: null }
assert.equal(advanceCall(input, prepared, { snapshot }, deployment).functionName, 'claimAdvance')
assert.equal(verifyAdvanceReceipt(receipt, tx, input, prepared, { snapshot }, deployment, abi), snapshot.campaignId)
assert.throws(() => verifyAdvanceReceipt(receipt, { ...tx, input: '0x' }, input, prepared, { snapshot }, deployment, abi))
const report = { kind: 'read-only-automated-frontend-B', deploymentId: deployment.deploymentId, campaignId: snapshot.campaignId,
  transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, checks: ['generated-ABI-policy-match', 'wallet-RPC-identity-and-policy', 'wrong-code-rejected', 'real-advance-receipt-and-amount', 'replacement-calldata-rejected'], status: 'PASS', manualWalletSigning: false }
fs.writeFileSync(new URL('../../.local/workflow-b/frontend-wallet-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
