import type { Address, Hex } from 'viem'

export interface DeploymentContext {
  protocolKind: 'CAMPAIGNS'
  chainId: 31339
  rpcUrl: string
  contractAddress: Address
  tokenAddress: Address
  resolver: Address
  backupResolver: Address
  judges: Address[]
  tokenDecimals: 6
  confirmations: 1
  genesisHash: Hex
  contractCodeHash: Hex
  tokenCodeHash: Hex
  deploymentBlockNumber: string
  deploymentBlockHash: Hex
  deploymentId: Hex
  abiVersion: 'campaigns-local-judge-v1'
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
  if (v.protocolKind !== 'CAMPAIGNS' || v.chainId !== 31339 || v.tokenDecimals !== 6 || v.confirmations !== 1 || v.abiVersion !== 'campaigns-local-judge-v1')
    throw new Error('Cấu hình Campaign không khớp.')
  const rpc = new URL(String(v.rpcUrl))
  if (!(['localhost', '127.0.0.1'].includes(rpc.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(rpc.hostname))
    || rpc.protocol !== 'http:' || rpc.port !== '9548' || rpc.username || rpc.password || rpc.search || rpc.hash)
    throw new Error('RPC không thuộc môi trường local Campaign.')
  if (typeof v.deploymentBlockNumber !== 'string' || !/^(0|[1-9]\d*)$/.test(v.deploymentBlockNumber)) throw new Error('Thiếu deployment anchor.')
  const policyHash = hex('policyHash')
  const backupResolver = hex('backupResolver', 40)
  if (!Array.isArray(v.judges) || v.judges.length < 3) throw new Error('Deployment không có đủ Judge.')
  const judges = v.judges.map((judge, index) => {
    if (typeof judge !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(judge) || /^0x0+$/.test(judge))
      throw new Error(`Deployment không hợp lệ: judges[${index}].`)
    return judge as Address
  })
  if (new Set(judges.map(judge => judge.toLowerCase())).size !== judges.length || judges.some(judge => [String(v.resolver), String(v.backupResolver)].map(value => value.toLowerCase()).includes(judge.toLowerCase())))
    throw new Error('Deployment Judge pool không hợp lệ.')
  return Object.freeze({ protocolKind: 'CAMPAIGNS', chainId: 31339, rpcUrl: String(v.rpcUrl),
    contractAddress: hex('contractAddress', 40), tokenAddress: hex('tokenAddress', 40), resolver: hex('resolver', 40), backupResolver,
    judges,
    tokenDecimals: 6, confirmations: 1, genesisHash: hex('genesisHash'), contractCodeHash: hex('contractCodeHash'),
    tokenCodeHash: hex('tokenCodeHash'), deploymentBlockNumber: v.deploymentBlockNumber, deploymentBlockHash: hex('deploymentBlockHash'),
    deploymentId: policyHash, abiVersion: 'campaigns-local-judge-v1', abiHash: hex('abiHash'), policyHash })
}
