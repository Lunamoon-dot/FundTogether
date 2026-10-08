import { keccak256, toHex } from 'viem';
export const CHAIN_DEPLOYMENT = Symbol('CHAIN_DEPLOYMENT');
export const MVP_MILESTONE_POLICY = keccak256(toHex('FundTogether.MVP.milestone.no-slash.v1'));

export interface ChainDeployment {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  confirmations: number;
  resolver: string;
  genesisHash: string;
  contractCodeHash: string;
  tokenCodeHash: string;
  deploymentBlockNumber?: string;
  deploymentBlockHash?: string;
  milestonePolicy?: string;
  recoveryPolicy?: string;
  deploymentId?: string;
}

export function deploymentAnchorMatches(a: Pick<ChainDeployment, 'deploymentBlockNumber' | 'deploymentBlockHash'>,
  b: Pick<ChainDeployment, 'deploymentBlockNumber' | 'deploymentBlockHash'>) {
  return (a.deploymentBlockNumber ?? null) === (b.deploymentBlockNumber ?? null)
    && (a.deploymentBlockHash ?? null) === (b.deploymentBlockHash ?? null);
}
