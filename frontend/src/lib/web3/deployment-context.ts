import manifest from '@fundtogether/deployment'
import { defineChain } from 'viem'
import type { Chain } from 'viem'
import { foundry } from 'viem/chains'
import { assertAdvanceArtifacts, validateDeploymentContext } from './deployment-policy'
import advanceAbi from '../../../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json'
import advancePolicy from '../../../../backend/src/blockchain/generated/advance/policy.json'

export const isAdvance = import.meta.env.MODE === 'workflow-b'
const deployment = validateDeploymentContext(manifest, isAdvance ? 'ADVANCE' : 'BASELINE')
if (isAdvance) assertAdvanceArtifacts(deployment, advanceAbi, advancePolicy)
export const activeChain: Chain = isAdvance ? defineChain({ id: 31338, name: 'FundTogether Workflow B',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [deployment.rpcUrl] } } }) : foundry
export default deployment
