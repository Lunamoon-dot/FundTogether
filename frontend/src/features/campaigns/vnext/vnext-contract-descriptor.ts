import type { Address } from 'viem';
import type { VNextDeployment } from '../api/campaigns';

export type VNextContractKind = 'campaign' | 'review' | 'registry' | 'token';

export function vnextContractAddress(kind: VNextContractKind, deployment: VNextDeployment): Address {
  if (!deployment.configured) throw new Error('VNext deployment is not configured');
  const address = {
    campaign: deployment.campaignEscrow,
    review: deployment.juryReview,
    registry: deployment.juryRegistry,
    token: deployment.tokenAddress,
  }[kind];
  if (!address) throw new Error(`VNext ${kind} address is missing`);
  return address;
}
