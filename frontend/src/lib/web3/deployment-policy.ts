import type { Address, Hex } from 'viem'

export interface DeploymentContext {
  protocolKind: 'HED'
  chainId: 31339
  rpcUrl: string
  contractAddress: Address
  tokenAddress: Address
  resolver: Address
  tokenDecimals: 6
  confirmations: 1
  genesisHash: Hex
  contractCodeHash: Hex
  tokenCodeHash: Hex
  deploymentBlockNumber: string
  deploymentBlockHash: Hex
  deploymentId: Hex
  abiVersion: '1'
  abiHash: Hex
  policyHash: Hex
}

export function validateDeploymentContext(value: unknown): DeploymentContext {
  if (!value || typeof value !== 'object') throw new Error('Thiếu deployment manifest.')
  const v = value as Record<string, unknown>
  const hex = (key: string, length = 64) => {
    const field = v[key]
    if (typeof field !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${length}}$`).test(field) || /^0x0+$/.test(field))
      throw new Error(`Deployment không hợp lệ: ${key}.`)
    return field as Hex
  }
  if (v.protocolKind !== 'HED' || v.chainId !== 31339 || v.tokenDecimals !== 6 || v.confirmations !== 1 || v.abiVersion !== '1')
    throw new Error('Cấu hình HED không khớp.')
  const rpc = new URL(String(v.rpcUrl))
  if (!(['localhost', '127.0.0.1'].includes(rpc.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(rpc.hostname))
    || rpc.protocol !== 'http:' || rpc.port !== '9548' || rpc.username || rpc.password || rpc.search || rpc.hash)
    throw new Error('RPC không thuộc môi trường local HED.')
  if (typeof v.deploymentBlockNumber !== 'string' || !/^(0|[1-9]\d*)$/.test(v.deploymentBlockNumber)) throw new Error('Thiếu deployment anchor.')
  const policyHash = hex('policyHash')
  hex('backupResolver', 40)
  return Object.freeze({ protocolKind: 'HED', chainId: 31339, rpcUrl: String(v.rpcUrl),
    contractAddress: hex('contractAddress', 40), tokenAddress: hex('tokenAddress', 40), resolver: hex('resolver', 40),
    tokenDecimals: 6, confirmations: 1, genesisHash: hex('genesisHash'), contractCodeHash: hex('contractCodeHash'),
    tokenCodeHash: hex('tokenCodeHash'), deploymentBlockNumber: v.deploymentBlockNumber, deploymentBlockHash: hex('deploymentBlockHash'),
    deploymentId: policyHash, abiVersion: '1', abiHash: hex('abiHash'), policyHash })
}
