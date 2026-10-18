import type { Abi, Address } from 'viem';
import { defineChain } from 'viem';
import historicalManifest from '@fundtogether/historical-deployment';
import historicalCampaignAbiJson from '../../../../backend/src/blockchain/generated/fundtogether/fund-together-historical-campaign.abi.json';
import tokenAbiJson from '../../../../backend/src/blockchain/generated/fundtogether/mock-usdc.abi.json';

export const historicalCampaignAbi = historicalCampaignAbiJson as Abi;
export const tokenAbi = tokenAbiJson as Abi;

const rawManifest = historicalManifest as { rpcUrl: string; contractAddress: Address; tokenAddress: Address; historicalCampaignAddress?: Address };
export const activeChain = defineChain({ id: 31339, name: 'FundTogether Campaign workflow',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rawManifest.rpcUrl] } } });
export const deployment = rawManifest;

// Retrieve the historical campaign address from local manifest or environment fallback
export const historicalCampaignAddress: Address =
  (rawManifest.historicalCampaignAddress ||
   (import.meta.env.VITE_FUNDTOGETHER_CONTRACT_ADDRESS as Address) ||
   deployment.contractAddress);

export const historicalTokenAddress: Address = deployment.tokenAddress;
