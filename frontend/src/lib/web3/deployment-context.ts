import manifest from '@fundtogether/deployment'
import { defineChain } from 'viem'
import type { Chain } from 'viem'
import { foundry } from 'viem/chains'
import { assertAdvanceArtifacts, validateDeploymentContext } from './deployment-policy'
import advanceAbi from '../../../../backend/src/blockchain/generated/advance/fund-together-advance.abi.json'
import advancePolicy from '../../../../backend/src/blockchain/generated/advance/policy.json'

export const isAdvance = import.meta.env.MODE === 'workflow-b'
export const isHed = import.meta.env.MODE === 'hed'
const deployment = validateDeploymentContext(manifest, isAdvance ? 'ADVANCE' : isHed ? 'HED' : 'BASELINE')
if (isAdvance) assertAdvanceArtifacts(deployment, advanceAbi, advancePolicy)
export const activeChain: Chain = isAdvance || isHed ? defineChain({ id: isAdvance ? 31338 : 31339, name: isAdvance ? 'FundTogether Workflow B' : 'FundTogether HED',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [deployment.rpcUrl] } } }) : foundry
export default deployment
