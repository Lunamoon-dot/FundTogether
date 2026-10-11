import manifest from '@fundtogether/deployment'
import { defineChain } from 'viem'
import type { Chain } from 'viem'
import { validateDeploymentContext } from './deployment-policy'

export const isHed = true
const deployment = validateDeploymentContext(manifest)
export const activeChain: Chain = defineChain({ id: 31339, name: 'FundTogether HED',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [deployment.rpcUrl] } } })
export default deployment
