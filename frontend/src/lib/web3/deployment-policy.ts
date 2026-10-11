import { keccak256, toHex } from 'viem'
import type { Address, Hex } from 'viem'

export interface DeploymentContext {
  protocolKind: 'BASELINE' | 'ADVANCE' | 'HED'
  chainId: number
  rpcUrl: string
  contractAddress: Address
  tokenAddress: Address
  resolver: Address
  tokenDecimals: 6
  confirmations: number
  genesisHash: Hex
  contractCodeHash: Hex
  tokenCodeHash: Hex
  deploymentBlockNumber: string
  deploymentBlockHash: Hex
  deploymentId: Hex
  workflowPolicy?: Hex
  abiVersion?: '1'
  abiHash?: Hex
  policyHash?: Hex
  atomicSubmission: boolean
  milestonePolicy?: Hex
  recoveryPolicy?: Hex
}

export function validateDeploymentContext(value: unknown, expected: 'BASELINE' | 'ADVANCE' | 'HED'): DeploymentContext {
  if (!value || typeof value !== 'object') throw new Error('Thiếu deployment manifest.')
  const v = value as Record<string, unknown>
  const hex = (key: string, length = 64) => {
    const field = v[key]
    if (typeof field !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${length}}$`).test(field) || /^0x0+$/.test(field))
      throw new Error(`Deployment không hợp lệ: ${key}.`)
    return field as Hex
  }
  const kind = v.protocolKind ?? 'BASELINE'
  if (kind !== expected || v.chainId !== (kind === 'ADVANCE' ? 31338 : kind === 'HED' ? 31339 : 31337) || v.tokenDecimals !== 6 || v.confirmations !== 1)
    throw new Error('Workflow, chain hoặc cấu hình token không khớp.')
  const rpc = new URL(String(v.rpcUrl))
  if (!['localhost', '127.0.0.1'].includes(rpc.hostname) || rpc.protocol !== 'http:' || rpc.port !== (kind === 'ADVANCE' ? '9547' : kind === 'HED' ? '9548' : '8545')
    || rpc.username || rpc.password || rpc.search || rpc.hash) throw new Error('RPC không thuộc môi trường local đã chọn.')
  if (typeof v.deploymentBlockNumber !== 'string' || !/^(0|[1-9]\d*)$/.test(v.deploymentBlockNumber)) throw new Error('Thiếu deployment anchor.')
  const result: DeploymentContext = { protocolKind: expected, chainId: v.chainId as number, rpcUrl: String(v.rpcUrl),
    contractAddress: hex('contractAddress', 40), tokenAddress: hex('tokenAddress', 40), resolver: hex('resolver', 40),
    tokenDecimals: 6, confirmations: 1, genesisHash: hex('genesisHash'), contractCodeHash: hex('contractCodeHash'),
    tokenCodeHash: hex('tokenCodeHash'), deploymentBlockNumber: v.deploymentBlockNumber, deploymentBlockHash: hex('deploymentBlockHash'),
    deploymentId: expected === 'HED' ? hex('policyHash') : hex('deploymentId'), atomicSubmission: v.atomicSubmission === true }
  if (expected === 'ADVANCE') {
    if (v.abiVersion !== '1') throw new Error('ABI version B không được hỗ trợ.')
    Object.assign(result, { abiVersion: '1', abiHash: hex('abiHash'), policyHash: hex('policyHash'), workflowPolicy: hex('workflowPolicy') })
  } else if (expected === 'HED') {
    Object.assign(result, { abiVersion: '1', abiHash: hex('abiHash'), policyHash: hex('policyHash') })
  } else {
    if (v.milestonePolicy) result.milestonePolicy = hex('milestonePolicy')
    if (v.recoveryPolicy) result.recoveryPolicy = hex('recoveryPolicy')
  }
  return Object.freeze(result)
}

export function assertAdvanceArtifacts(deployment: DeploymentContext, abi: unknown, policy: unknown) {
  const hash = (value: unknown) => keccak256(toHex(JSON.stringify(value, null, 2) + '\n'))
  if (deployment.protocolKind !== 'ADVANCE' || hash(abi) !== deployment.abiHash || hash(policy) !== deployment.policyHash
    || keccak256(toHex('FundTogether.advance.no-bond.v1')) !== deployment.workflowPolicy)
    throw new Error('ABI hoặc policy B không khớp deployment manifest. Cần xuất lại artifact đúng deployment.')
}
