import manifest from '@fundtogether/deployment'
import { defineChain } from 'viem'
import type { Chain } from 'viem'
import { validateDeploymentContext, validateVNextDeploymentContext } from './deployment-policy'

const deployment = (manifest as { protocolKind?: unknown }).protocolKind === 'FUNDTOGETHER_VNEXT'
  ? validateVNextDeploymentContext(manifest)
  : validateDeploymentContext(manifest)
export const activeChain: Chain = defineChain({ id: 31339, name: deployment.protocolKind === 'FUNDTOGETHER_VNEXT' ? 'FundTogether VNext' : 'FundTogether Campaign',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [deployment.rpcUrl] } } })
export default deployment
