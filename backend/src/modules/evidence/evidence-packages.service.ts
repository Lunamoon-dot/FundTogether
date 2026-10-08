import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { DRIZZLE_DB } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { campaignMilestoneDrafts, campaignSubmissions, evidenceDrafts, evidencePackages } from '../../database/schema';
import { IndexerService } from '../../indexer/indexer.service';
import { criteriaCommitment } from '../campaigns/submission-plan';
import { EvidenceDraftsService } from './evidence-drafts.service';
import { evidencePackageSchema } from './evidence.schema';
import { EvidenceStorageService } from './evidence-storage.service';

@Injectable()
export class EvidencePackagesService {
  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>,
    private readonly drafts: EvidenceDraftsService, private readonly storage: EvidenceStorageService,
    private readonly chain: BlockchainService, private readonly indexer: IndexerService) {}

  private summary(row: typeof evidencePackages.$inferSelect) {
    const digest = `0x${createHash('sha256').update(Buffer.from(row.manifestBytes, 'utf8')).digest('hex')}`;
    if (digest !== row.evidenceHash) throw new ServiceUnavailableException('Frozen evidence manifest failed its stored hash check');
    return { id: row.id, evidenceHash: row.evidenceHash, submissionVersion: row.submissionVersion,
      draftRevision: row.draftRevision, createdAt: row.createdAt };
  }

  async list(campaignId: string, milestoneIndex: string, userId: string) {
    await this.drafts.get(campaignId, milestoneIndex, userId);
    const rows = await this.database.select().from(evidencePackages).where(and(
      eq(evidencePackages.campaignMetadataId, campaignId), eq(evidencePackages.milestoneIndex, milestoneIndex),
    )).orderBy(desc(evidencePackages.createdAt));
    return { items: rows.map(row => this.summary(row)) };
  }

  async manifest(campaignId: string, milestoneIndex: string, packageId: string, userId: string) {
    await this.drafts.get(campaignId, milestoneIndex, userId);
    const [row] = await this.database.select().from(evidencePackages).where(and(
      eq(evidencePackages.id, packageId), eq(evidencePackages.campaignMetadataId, campaignId),
      eq(evidencePackages.milestoneIndex, milestoneIndex),
    )).limit(1);
    if (!row) throw new NotFoundException('Frozen evidence package not found');
    this.summary(row);
    return row.manifestBytes;
  }

  async freeze(campaignId: string, milestoneIndex: string, userId: string, expectedRevision: number) {
    const draft = await this.drafts.get(campaignId, milestoneIndex, userId);
    if (draft.revision !== expectedRevision) throw new ConflictException('Evidence draft changed; reload before freezing');
    const index = Number(milestoneIndex);
    const [submission, milestone] = await Promise.all([
      this.database.select().from(campaignSubmissions).where(eq(campaignSubmissions.campaignMetadataId, campaignId)).limit(1),
      this.database.select().from(campaignMilestoneDrafts).where(and(
        eq(campaignMilestoneDrafts.campaignMetadataId, campaignId), eq(campaignMilestoneDrafts.milestoneIndex, index),
      )).limit(1),
    ]);
    const plan = submission[0]?.plan;
    if (!plan || !milestone[0] || !Number.isSafeInteger(index) || index < 0 || index >= plan.budgetUnits.length)
      throw new ConflictException('Campaign submission or milestone is unavailable');
    if (criteriaCommitment(milestone[0]) !== plan.criteriaHashes[index] || milestone[0].budgetUnits !== plan.budgetUnits[index])
      throw new ConflictException('Milestone no longer matches the approved campaign plan');
    const outcomes = draft.content.report.outcomes;
    const criteria = milestone[0].acceptanceCriteria;
    if (!draft.content.documents.length || outcomes.length !== criteria.length
      || new Set(outcomes.map(item => item.criterionId)).size !== criteria.length
      || criteria.some(item => !outcomes.some(outcome => outcome.criterionId === item.criterionId)))
      throw new BadRequestException('Add evidence documents and a result for every approved criterion before freezing');

    await this.chain.verifyDeployment();
    const deployment = this.chain.deployment;
    if (plan.chainId !== deployment.chainId || plan.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase()
      || plan.tokenAddress.toLowerCase() !== deployment.tokenAddress.toLowerCase() || plan.genesisHash !== deployment.genesisHash
      || plan.contractCodeHash !== deployment.contractCodeHash || plan.tokenCodeHash !== deployment.tokenCodeHash
      || plan.deploymentBlockNumber !== deployment.deploymentBlockNumber || plan.deploymentBlockHash !== deployment.deploymentBlockHash)
      throw new ConflictException('Campaign belongs to a different deployment');
    const sync = await this.indexer.status();
    if (sync.status !== 'ready') throw new ServiceUnavailableException('Indexer must catch up before evidence can be frozen');
    const block = await this.chain.client.getBlock({ blockTag: 'latest' });
    const keyed = await this.chain.read('campaignForDraft', [plan.organizer, plan.draftKey], block.number) as bigint;
    if (keyed === 0n) throw new ConflictException('Campaign is not present on the configured chain');
    const id = keyed - 1n;
    const [state, current, deadline, version, limit, onchainCriteria, onchainMilestone, onchainCampaign] = await Promise.all([
      this.chain.read('campaignState', [id], block.number), this.chain.read('currentMilestoneIndex', [id], block.number),
      this.chain.read('evidenceDeadlines', [id, BigInt(index)], block.number),
      this.chain.read('submissionVersion', [id, BigInt(index)], block.number), this.chain.read('MAX_SUBMISSIONS', [], block.number),
      this.chain.read('milestoneCriteria', [id, BigInt(index)], block.number),
      this.chain.read('milestones', [id, BigInt(index)], block.number), this.chain.read('campaigns', [id], block.number),
    ]);
    const [title, token, goal, bond, organizer] = onchainCampaign as [string, string, bigint, bigint, string];
    if (title !== plan.title || token.toLowerCase() !== plan.tokenAddress.toLowerCase()
      || organizer.toLowerCase() !== plan.organizer.toLowerCase() || goal !== BigInt(plan.goalUnits)
      || bond !== BigInt(plan.bondUnits) || String(onchainCriteria).toLowerCase() !== plan.criteriaHashes[index].toLowerCase()
      || (onchainMilestone as [bigint, number])[0] !== BigInt(plan.budgetUnits[index]))
      throw new ConflictException('Chain campaign does not match the approved evidence target');
    const milestoneState = Number((onchainMilestone as [bigint, number])[1]);
    const canFreeze = ([3, 9].includes(Number(state)) && milestoneState === 0)
      || (Number(state) === 6 && milestoneState === 1 && block.timestamp < (deadline as bigint));
    if (!canFreeze || current !== BigInt(index) || (version as bigint) >= (limit as bigint))
      throw new ConflictException('Current milestone is not ready for evidence freeze');

    for (const document of draft.content.documents) {
      if (document.storageObjectId !== document.documentId || document.visibility !== 'RESTRICTED_ORIGINAL')
        throw new ConflictException('Evidence document is not a verified private original');
      try {
        const object = await this.storage.get(document.storageObjectId);
        if (!object.Body) throw new Error('Missing object body');
        const bytes = await object.Body.transformToByteArray();
        const hash = `0x${createHash('sha256').update(bytes).digest('hex')}`;
        if (bytes.length !== document.byteSize || hash.toLowerCase() !== document.sha256.toLowerCase())
          throw new ConflictException('Stored evidence document does not match its upload hash');
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        throw new ServiceUnavailableException('Evidence original could not be read for integrity checking');
      }
    }
    if ((await this.chain.client.getBlock({ blockNumber: block.number })).hash !== block.hash)
      throw new ConflictException('Chain changed while checking evidence; retry');
    const latestBlock = await this.chain.client.getBlock({ blockTag: 'latest' });
    const [latestState, latestCurrent, latestDeadline, latestVersion] = await Promise.all([
      this.chain.read('campaignState', [id], latestBlock.number),
      this.chain.read('currentMilestoneIndex', [id], latestBlock.number),
      this.chain.read('evidenceDeadlines', [id, BigInt(index)], latestBlock.number),
      this.chain.read('submissionVersion', [id, BigInt(index)], latestBlock.number),
    ]);
    if (latestState !== state || latestCurrent !== BigInt(index) || latestVersion !== version
      || latestDeadline !== deadline || (Number(latestState) === 6 && latestBlock.timestamp >= (latestDeadline as bigint)))
      throw new ConflictException('Milestone changed while checking evidence; retry');

    return this.database.transaction(async tx => {
      const [locked] = await tx.select().from(evidenceDrafts).where(eq(evidenceDrafts.id, draft.id)).for('update');
      if (!locked || locked.revision !== expectedRevision) throw new ConflictException('Evidence draft changed during freezing');
      const submissionVersion = Number(version as bigint) + 1;
      const [existing] = await tx.select().from(evidencePackages).where(and(
        eq(evidencePackages.campaignMetadataId, campaignId), eq(evidencePackages.milestoneIndex, milestoneIndex),
        eq(evidencePackages.draftRevision, expectedRevision), eq(evidencePackages.submissionVersion, submissionVersion),
      )).limit(1);
      if (existing) return this.summary(existing);
      const [parent] = await tx.select({ id: evidencePackages.id }).from(evidencePackages).where(and(
        eq(evidencePackages.campaignMetadataId, campaignId), eq(evidencePackages.milestoneIndex, milestoneIndex),
      )).orderBy(desc(evidencePackages.createdAt)).limit(1);
      const packageId = randomUUID();
      const manifest = evidencePackageSchema.parse({ schemaVersion: '0.1', packageId, chainId: String(plan.chainId),
        contractAddress: plan.contractAddress, campaignId: id.toString(), milestoneIndex,
        submissionVersion: String(submissionVersion), organizerAddress: plan.organizer,
        criteriaHash: plan.criteriaHashes[index], checklistVersion: '0.1', parentPackageId: parent?.id ?? null,
        createdAt: new Date().toISOString(), ...locked.content });
      const manifestBytes = JSON.stringify(manifest);
      const evidenceHash = `0x${createHash('sha256').update(Buffer.from(manifestBytes, 'utf8')).digest('hex')}`;
      const [saved] = await tx.insert(evidencePackages).values({ id: packageId, campaignMetadataId: campaignId,
        milestoneIndex, organizerUserId: userId, submissionVersion, draftRevision: expectedRevision,
        manifestBytes, evidenceHash }).returning();
      return this.summary(saved);
    });
  }
}
