import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createPublicClient, http, keccak256, zeroHash } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { foundry } from 'viem/chains';
import { CHAIN_DEPLOYMENT, deploymentAnchorMatches } from './blockchain.constants';
import type { ChainDeployment } from './blockchain.constants';
import generatedAbi = require('./generated/fund-together-mvp.abi.json');
import type { SubmissionPlan } from '../modules/campaigns/submission-plan';

export interface CampaignSnapshot {
  name: string;
  token: Address;
  organizer: Address;
  goalUnits: string;
  requiredBondUnits: string;
  bondAmountUnits: string;
  bondLocked: boolean;
  totalContributedUnits: string;
  fundingDeadline: string;
  chainState: number;
  milestones: { budgetUnits: string; criteriaHash: Hex }[];
  published: boolean;
  publicationTransactionHash: Hex | null;
  indexedBlock: string;
}

export function matchesSubmission(plan: SubmissionPlan, snapshot: CampaignSnapshot) {
  return plan.title === snapshot.name &&
    plan.organizer.toLowerCase() === snapshot.organizer.toLowerCase() &&
    plan.tokenAddress.toLowerCase() === snapshot.token.toLowerCase() &&
    plan.goalUnits === snapshot.goalUnits && plan.bondUnits === snapshot.requiredBondUnits &&
    String(plan.fundingDeadline) === snapshot.fundingDeadline &&
    plan.budgetUnits.length === snapshot.milestones.length &&
    snapshot.milestones.every((milestone, index) =>
      milestone.budgetUnits === plan.budgetUnits[index] &&
      (milestone.criteriaHash === zeroHash || milestone.criteriaHash === plan.criteriaHashes[index]));
}

export function criteriaReady(plan: SubmissionPlan, snapshot: CampaignSnapshot) {
  return matchesSubmission(plan, snapshot) &&
    snapshot.milestones.every((milestone, index) => milestone.criteriaHash === plan.criteriaHashes[index]);
}

@Injectable()
export class BlockchainService {
  readonly client;
  readonly abi = generatedAbi as Abi;

  constructor(@Inject(CHAIN_DEPLOYMENT) readonly deployment: ChainDeployment) {
    this.client = createPublicClient({ chain: foundry, transport: http(deployment.rpcUrl, { timeout: 8_000, retryCount: 0 }) });
  }

  isConfigured(): boolean {
    return Boolean(this.deployment.rpcUrl);
  }

  async verifyDeployment(expected: Pick<ChainDeployment, 'chainId' | 'contractAddress' | 'tokenAddress' | 'genesisHash' | 'contractCodeHash' | 'tokenCodeHash' | 'deploymentBlockNumber' | 'deploymentBlockHash'> = this.deployment) {
    try {
      if (!deploymentAnchorMatches(expected, this.deployment)) throw new Error('Different deployment incarnation');
      if ((expected.deploymentBlockNumber === undefined) !== (expected.deploymentBlockHash === undefined))
        throw new Error('Incomplete deployment anchor');
      const [chainId, genesis, code, tokenCode] = await Promise.all([
        this.client.getChainId(), this.client.getBlock({ blockNumber: 0n }),
        this.client.getCode({ address: expected.contractAddress as Address }),
        this.client.getCode({ address: expected.tokenAddress as Address }),
      ]);
      if (chainId !== 31337 || chainId !== expected.chainId || genesis.hash !== expected.genesisHash ||
          !code || !tokenCode || keccak256(code) !== expected.contractCodeHash || keccak256(tokenCode) !== expected.tokenCodeHash)
        throw new Error('Deployment mismatch');
      if (expected.deploymentBlockNumber !== undefined) {
        const anchor = await this.client.getBlock({ blockNumber: BigInt(expected.deploymentBlockNumber) });
        if (anchor.hash !== expected.deploymentBlockHash) throw new Error('Deployment anchor changed');
      }
      const token = await this.read('supportedToken', [], undefined, expected.contractAddress as Address);
      if (String(token).toLowerCase() !== expected.tokenAddress.toLowerCase()) throw new Error('Unsupported token');
      const d = this.deployment;
      if (d.milestonePolicy || d.recoveryPolicy || d.deploymentId) {
        if (!d.milestonePolicy || !d.recoveryPolicy || !d.deploymentId || d.deploymentId === zeroHash)
          throw new Error('Incomplete MVP deployment identity');
        const [milestone, recovery, instance] = await Promise.all([
          this.read('MILESTONE_POLICY', [], undefined, expected.contractAddress as Address),
          this.read('RECOVERY_POLICY', [], undefined, expected.contractAddress as Address),
          this.read('deploymentId', [], undefined, expected.contractAddress as Address),
        ]);
        if (milestone !== d.milestonePolicy || recovery !== d.recoveryPolicy || instance !== d.deploymentId)
          throw new Error('MVP deployment identity changed');
      }
    } catch {
      throw new ServiceUnavailableException('Configured local blockchain is unavailable or its deployment identity changed.');
    }
  }

  read(functionName: string, args: unknown[], blockNumber?: bigint, address = this.deployment.contractAddress as Address) {
    return this.client.readContract({ address, abi: this.abi, functionName, args, blockNumber });
  }

  async snapshot(id: bigint, blockNumber: bigint): Promise<CampaignSnapshot> {
    const [campaign, state, deadline, count] = await Promise.all([
      this.read('campaigns', [id], blockNumber), this.read('campaignState', [id], blockNumber),
      this.read('fundingDeadlines', [id], blockNumber), this.read('milestoneCount', [id], blockNumber),
    ]);
    const [name, token, goal, requiredBond, organizer, bondLocked, bondAmount, contributed] =
      campaign as [string, Address, bigint, bigint, Address, boolean, bigint, bigint];
    const milestones: CampaignSnapshot['milestones'] = [];
    for (let index = 0n; index < (count as bigint); index++) {
      const [milestone, hash] = await Promise.all([
        this.read('milestones', [id, index], blockNumber), this.read('milestoneCriteria', [id, index], blockNumber),
      ]);
      milestones.push({ budgetUnits: (milestone as [bigint, number])[0].toString(), criteriaHash: hash as Hex });
    }
    return { name, token, organizer, goalUnits: goal.toString(), requiredBondUnits: requiredBond.toString(),
      bondAmountUnits: bondAmount.toString(), bondLocked, totalContributedUnits: contributed.toString(),
      fundingDeadline: (deadline as bigint).toString(), chainState: Number(state), milestones,
      published: false, publicationTransactionHash: null, indexedBlock: blockNumber.toString() };
  }
}
