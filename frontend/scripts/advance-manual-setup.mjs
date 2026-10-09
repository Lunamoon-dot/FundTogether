// Read-only preflight; never calls a wallet extension or signs on the user's behalf.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createPublicClient, http } from 'viem'
import { validateDeploymentContext, assertAdvanceArtifacts } from '../src/lib/web3/deployment-policy.ts'
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const deployment = validateDeploymentContext(read('../../.local/workflow-b/generated/deployment.local.json'), 'ADVANCE')
const abi = read('../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json')
assertAdvanceArtifacts(deployment, abi, read('../../backend/src/blockchain/generated/advance/policy.json'))
const client = createPublicClient({ transport: http(deployment.rpcUrl) })
assert.equal(await client.getChainId(), 31338)
assert.equal((await client.getBlock({ blockNumber: 0n })).hash, deployment.genesisHash)
assert.equal((await client.getBlock({ blockNumber: BigInt(deployment.deploymentBlockNumber) })).hash, deployment.deploymentBlockHash)
assert.equal(await client.readContract({ address: deployment.contractAddress, abi, functionName: 'deploymentId' }), deployment.deploymentId)
const health = await (await fetch('http://127.0.0.1:3001/health')).json()
for (const [key, value] of Object.entries(health.context)) assert.equal(value, deployment[key], `API context ${key}`)
assert.equal(health.status, 'ready', 'API/RPC/private storage/indexer must be ready')
const source = await (await fetch('http://127.0.0.1:5174/src/lib/web3/deployment-context.ts')).text()
assert.match(source.replaceAll('\\', '/'), /\.local\/workflow-b\/generated\/deployment\.local\.json/, 'Port5174 must serve the B manifest')
const result = { checkedAt: new Date().toISOString(), status: 'READY_FOR_MANUAL', manualAcceptance: 'TODO',
  web: 'http://localhost:5174', api: 'http://localhost:3001', walletNetwork: { chainId: '0x7a6a', chainName: 'FundTogether B local',
    rpcUrls: [deployment.rpcUrl], nativeCurrency: { name: 'Local Ether', symbol: 'ETH', decimals: 18 } },
  token: { address: deployment.tokenAddress, symbol: 'mUSDC', decimals: 6 }, context: health.context, indexer: health.indexer,
  instructions: ['Log in to an account, then connect its linked wallet on31338.', 'Verify the role and required wallet shown before each action.',
    'A person must approve or decline extension prompts and record the outcome.', 'Keep local credentials/private keys outside reports and screenshots.'] }
fs.writeFileSync(new URL('../../.local/workflow-b/manual-preflight.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
console.log('Workflow B preflight PASS: chain/deployment/artifacts/API/private storage/indexer/frontend; manual acceptance TODO')
