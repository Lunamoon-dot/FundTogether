import { keccak256, stringToHex } from 'viem';
import type { Address, Hex } from 'viem';

export interface SubmissionPlan {
  chainId: number;
  contractAddress: Address;
  tokenAddress: Address;
  organizer: Address;
  genesisHash: Hex;
  contractCodeHash: Hex;
  tokenCodeHash: Hex;
  deploymentBlockNumber?: string;
  deploymentBlockHash?: Hex;
  confirmations: number;
  draftKey: Hex;
  title: string;
  fundingDeadline: number;
  budgetUnits: string[];
  criteriaHashes: Hex[];
  goalUnits: string;
  bondUnits: string;
}

export function criteriaCommitment(milestone: { title: string; description: string | null; acceptanceCriteria: { criterionId: string; description: string }[] }) {
  // Versioned canonical field order; preserve criterion order committed by organizer.
  return keccak256(stringToHex(JSON.stringify({ version: 1, title: milestone.title, description: milestone.description,
    acceptanceCriteria: milestone.acceptanceCriteria.map(item => ({ criterionId: item.criterionId, description: item.description })) })));
}
