import type { Abi, Address } from 'viem';
import deployment, { activeChain } from './deployment-context';
import rewardAbiJson from '../../../../backend/src/blockchain/generated/reward/fund-together-reward.abi.json';
import tokenAbiJson from '../../../../backend/src/blockchain/generated/reward/mock-usdc.abi.json';

export const rewardAbi = rewardAbiJson as Abi;
export const tokenAbi = tokenAbiJson as Abi;

// Retrieve reward contract address from local manifest or environment fallback
const rawManifest = deployment as unknown as Record<string, unknown>;
export const rewardContractAddress: Address =
  ((rawManifest.rewardContractAddress as Address) ||
   (import.meta.env.VITE_REWARD_CONTRACT_ADDRESS as Address) ||
   deployment.contractAddress);

export const rewardTokenAddress: Address = deployment.tokenAddress;
export { activeChain, deployment };
