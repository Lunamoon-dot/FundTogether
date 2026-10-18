import type { Address, Hex } from 'viem'

export interface DeploymentContext {
  protocolKind: 'CAMPAIGNS'
  chainId: 31339
  rpcUrl: string
  contractAddress: Address
  tokenAddress: Address
  resolver: Address
  backupResolver: Address
  tokenDecimals: 6
  confirmations: 1
  genesisHash: Hex
  contractCodeHash: Hex
  tokenCodeHash: Hex
  deploymentBlockNumber: string
  deploymentBlockHash: Hex
  deploymentId: Hex
  abiVersion: 'campaigns-local-v6'
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
  if (v.protocolKind !== 'CAMPAIGNS' || v.chainId !== 31339 || v.tokenDecimals !== 6 || v.confirmations !== 1 || v.abiVersion !== 'campaigns-local-v6')
    throw new Error('Cấu hình Campaign không khớp.')
  const rpc = new URL(String(v.rpcUrl))
  if (!(['localhost', '127.0.0.1'].includes(rpc.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(rpc.hostname))
    || rpc.protocol !== 'http:' || rpc.port !== '9548' || rpc.username || rpc.password || rpc.search || rpc.hash)
    throw new Error('RPC không thuộc môi trường local Campaign.')
  if (typeof v.deploymentBlockNumber !== 'string' || !/^(0|[1-9]\d*)$/.test(v.deploymentBlockNumber)) throw new Error('Thiếu deployment anchor.')
  const policyHash = hex('policyHash')
  hex('backupResolver', 40)
  return Object.freeze({ protocolKind: 'CAMPAIGNS', chainId: 31339, rpcUrl: String(v.rpcUrl),
    contractAddress: hex('contractAddress', 40), tokenAddress: hex('tokenAddress', 40), resolver: hex('resolver', 40), backupResolver: hex('backupResolver', 40),
    tokenDecimals: 6, confirmations: 1, genesisHash: hex('genesisHash'), contractCodeHash: hex('contractCodeHash'),
    tokenCodeHash: hex('tokenCodeHash'), deploymentBlockNumber: v.deploymentBlockNumber, deploymentBlockHash: hex('deploymentBlockHash'),
    deploymentId: policyHash, abiVersion: 'campaigns-local-v6', abiHash: hex('abiHash'), policyHash })
}
