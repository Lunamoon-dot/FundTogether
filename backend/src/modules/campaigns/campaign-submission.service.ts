import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { keccak256, stringToHex, zeroHash } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { DRIZZLE_DB } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { campaignMetadata, campaignMilestoneDrafts, campaignSubmissions, organizations, walletLinks } from '../../database/schema';
import { EvidenceAccessService, campaignAccessCondition } from '../evidence/evidence-access.service';
import generatedAbi = require('../../blockchain/generated/fund-together.abi.json');
import { criteriaCommitment } from './submission-plan';
import type { SubmissionPlan } from './submission-plan';

const abi = generatedAbi as Abi;
@Injectable()
export class CampaignSubmissionService {
  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>, private readonly access: EvidenceAccessService, private readonly chain: BlockchainService) {}
  private get client() { return this.chain.client; }
  private get deployment() { return this.chain.deployment; }

  async verifyDeployment(plan: Parameters<BlockchainService['verifyDeployment']>[0] = this.deployment) {
    return this.chain.verifyDeployment(plan);
  }

  async get(campaignId: string, userId: string) {
    await this.access.assertCampaignOrganizer(campaignId, userId);
    const [submission] = await this.database.select().from(campaignSubmissions).where(eq(campaignSubmissions.campaignMetadataId, campaignId));
    return submission?.plan ?? null;
  }

  async prepare(campaignId: string, userId: string, expectedRevision: number, fundingDeadline: number) {
    const deployment = this.deployment;
    await this.access.assertCampaignOrganizer(campaignId, userId);
    await this.verifyDeployment();
    const block = await this.client.getBlock();
    return this.database.transaction(async tx => {
      const [campaign] = await tx.select().from(campaignMetadata)
        .where(and(eq(campaignMetadata.id, campaignId), campaignAccessCondition(userId))).for('update');
      if (!campaign) throw new ConflictException('Campaign access changed');
      const [existing] = await tx.select().from(campaignSubmissions).where(eq(campaignSubmissions.campaignMetadataId, campaignId));
      if (existing) return existing.plan;
      if (campaign.status !== 'draft' || campaign.revision !== expectedRevision || campaign.onchainCampaignId)
        throw new ConflictException('Campaign changed or is no longer an editable draft');
      if (!campaign.organizationId) throw new BadRequestException('An organization with a representative wallet is required');
      const [representative] = await tx.select({ address: walletLinks.address, chainId: walletLinks.chainId }).from(organizations)
        .innerJoin(walletLinks, eq(organizations.representativeWalletLinkId, walletLinks.id)).where(eq(organizations.id, campaign.organizationId));
      if (!representative || Number(representative.chainId) !== deployment.chainId)
        throw new BadRequestException('Select an organization representative wallet on the configured chain first');
      if (BigInt(fundingDeadline) <= block.timestamp) throw new BadRequestException('Funding deadline must be in the future');
      const milestones = await tx.select().from(campaignMilestoneDrafts).where(eq(campaignMilestoneDrafts.campaignMetadataId, campaignId)).orderBy(asc(campaignMilestoneDrafts.milestoneIndex));
      const max = (1n << 256n) - 1n;
      if (!milestones.length || milestones.some(m => !m.budgetUnits || !/^[1-9][0-9]{0,77}$/.test(m.budgetUnits) || BigInt(m.budgetUnits) > max || !m.acceptanceCriteria.length))
        throw new BadRequestException('Complete all milestone budgets and criteria before submitting');
      const budgets = milestones.map(m => BigInt(m.budgetUnits!));
      const goal = budgets.reduce((sum, n) => sum + n, 0n);
      if (goal > max) throw new BadRequestException('Goal exceeds uint256');
      const plan: SubmissionPlan = { chainId: deployment.chainId, contractAddress: deployment.contractAddress as Address, tokenAddress: deployment.tokenAddress as Address,
        organizer: representative.address as Address, genesisHash: deployment.genesisHash as Hex, contractCodeHash: deployment.contractCodeHash as Hex, tokenCodeHash: deployment.tokenCodeHash as Hex,
        deploymentBlockNumber: deployment.deploymentBlockNumber, deploymentBlockHash: deployment.deploymentBlockHash as Hex | undefined,
        confirmations: deployment.confirmations, draftKey: keccak256(stringToHex(campaignId)), title: campaign.title, fundingDeadline,
        budgetUnits: budgets.map(n => n.toString()), criteriaHashes: milestones.map(criteriaCommitment), goalUnits: goal.toString(), bondUnits: budgets.reduce((max, n) => n > max ? n : max, 0n).toString() };
      await tx.insert(campaignSubmissions).values({ campaignMetadataId: campaignId, plan });
      await tx.update(campaignMetadata).set({ status: 'submission_prepared', updatedAt: new Date() }).where(eq(campaignMetadata.id, campaignId));
      return plan;
    });
  }

  async sync(campaignId: string, userId: string) {
    const plan = await this.get(campaignId, userId);
    if (!plan) throw new BadRequestException('Prepare submission first');
    await this.verifyDeployment(plan);
    const latest = await this.client.getBlockNumber({ cacheTime: 0 });
    const blockNumber = latest - BigInt(plan.confirmations - 1);
    const block = await this.client.getBlock({ blockNumber });
    const assertCanonical = async () => {
      if (!block.hash || (await this.client.getBlock({ blockNumber })).hash !== block.hash)
        throw new ConflictException('Block changed while reconciling submission; retry synchronization');
    };
    const read = (functionName: string, args: unknown[]) => this.client.readContract({ address: plan.contractAddress, abi, functionName, args, blockNumber });
    const mapped = await read('campaignForDraft', [plan.organizer, plan.draftKey]) as bigint;
    if (mapped === 0n) {
      await assertCanonical();
      return { plan, stage: 'prepared', onchainCampaignId: null };
    }
    const id = mapped - 1n;
    const [campaign, deadline, count, state] = await Promise.all([read('campaigns', [id]), read('fundingDeadlines', [id]), read('milestoneCount', [id]), read('campaignState', [id])]);
    const [name, token, goal, bond, organizer, locked, amount] = campaign as [string, Address, bigint, bigint, Address, boolean, bigint, bigint];
    if (name !== plan.title || token.toLowerCase() !== plan.tokenAddress.toLowerCase() || organizer.toLowerCase() !== plan.organizer.toLowerCase() || goal !== BigInt(plan.goalUnits) || bond !== BigInt(plan.bondUnits) || deadline !== BigInt(plan.fundingDeadline) || count !== BigInt(plan.budgetUnits.length))
      throw new ConflictException('On-chain campaign does not match the frozen submission');
    let criteriaReady = true;
    for (let i = 0; i < plan.budgetUnits.length; i++) {
      const [milestone, hash] = await Promise.all([read('milestones', [id, BigInt(i)]), read('milestoneCriteria', [id, BigInt(i)])]);
      if ((milestone as [bigint, number])[0] !== BigInt(plan.budgetUnits[i])) throw new ConflictException('On-chain milestone budget mismatch');
      if (hash !== zeroHash && hash !== plan.criteriaHashes[i]) throw new ConflictException('On-chain criteria differ from the frozen submission');
      if (hash === zeroHash) criteriaReady = false;
    }
    const chainState = Number(state);
    const bonded = locked && amount >= BigInt(plan.bondUnits);
    let stage = !criteriaReady ? 'created' : bonded ? 'bond_locked' : 'criteria_ready';
    if (chainState === 5 || chainState === 4 || chainState === 12) stage = 'terminated';
    else if (chainState === 1) stage = bonded ? 'approved' : 'criteria_ready';
    else if (chainState !== 0) stage = 'published';
    await assertCanonical();
    await this.database.update(campaignMetadata).set({ chainId: String(plan.chainId), contractAddress: plan.contractAddress.toLowerCase(), onchainCampaignId: id.toString(),
      status: stage === 'approved' ? 'approved' : stage === 'bond_locked' ? 'awaiting_review' : stage === 'terminated' ? 'terminated' : stage === 'published' ? 'onchain_published' : 'submission_prepared', updatedAt: new Date() })
      .where(eq(campaignMetadata.id, campaignId));
    return { plan, stage, onchainCampaignId: id.toString(), bondLocked: Boolean(bonded), criteriaReady, chainState, confirmedBlock: blockNumber.toString() };
  }
}
