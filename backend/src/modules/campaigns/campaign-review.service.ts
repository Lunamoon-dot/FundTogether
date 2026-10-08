import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE_DB } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { campaignMetadata, campaignMilestoneDrafts, campaignReviews, campaignRevisions, platformRoles } from '../../database/schema';
import { BlockchainService, criteriaReady } from '../../blockchain/blockchain.service';
import { CampaignProjectionService } from './campaign-projection.service';
import { EvidenceAccessService } from '../evidence/evidence-access.service';

export type ReviewInput = { decision: 'approve' | 'request_changes' | 'reject'; reason: string; expectedDossierHash: string };

@Injectable()
export class CampaignReviewService {
  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>,
    private readonly projection: CampaignProjectionService, private readonly chain: BlockchainService,
    private readonly access: EvidenceAccessService) {}

  private async confirmed(plan: Parameters<typeof criteriaReady>[0], id: string) {
    await this.chain.verifyDeployment(plan);
    const head = await this.chain.client.getBlockNumber();
    const blockNumber = head - BigInt(plan.confirmations - 1);
    const block = await this.chain.client.getBlock({ blockNumber });
    if (await this.chain.read('campaignForDraft', [plan.organizer, plan.draftKey], blockNumber) !== BigInt(id) + 1n)
      throw new ConflictException('Campaign key changed');
    const snapshot = await this.chain.snapshot(BigInt(id), blockNumber);
    if (!criteriaReady(plan, snapshot) || (await this.chain.client.getBlock({ blockNumber })).hash !== block.hash)
      throw new ConflictException('Confirmed campaign identity changed');
    return { snapshot, block };
  }

  async decide(id: string, userId: string, input: ReviewInput) {
    const detail = await this.projection.reviewDetail(id, userId);
    if (detail.conflict) throw new ForbiddenException('Cannot review your own campaign or organization');
    if (detail.dossierHash !== input.expectedDossierHash) throw new ConflictException('Dossier changed; reload before reviewing');
    if (detail.review) {
      if (detail.review.reviewerUserId === userId && detail.review.decision === input.decision && detail.review.reason === input.reason && detail.review.dossierHash === input.expectedDossierHash) return detail.review;
      throw new ConflictException('This frozen submission already has an immutable review');
    }
    const { snapshot, block } = await this.confirmed(detail.campaign.plan, detail.campaign.onchainCampaignId);
    if (snapshot.chainState !== 0 || !snapshot.bondLocked || BigInt(snapshot.bondAmountUnits) < BigInt(snapshot.requiredBondUnits))
      throw new ConflictException('Only a bonded DRAFT can be reviewed');
    if (input.decision === 'approve' && (detail.checks.some(check => !check.passed) || BigInt(detail.campaign.plan.fundingDeadline) <= block.timestamp))
      throw new ConflictException('System checks must pass before approval');
    return this.database.transaction(async tx => {
      const [campaign] = await tx.select().from(campaignMetadata).where(eq(campaignMetadata.id, id)).for('update');
      const [staff] = await tx.select().from(platformRoles).where(eq(platformRoles.userId, userId)).for('share');
      if (!staff?.roles.includes('RESOLVER')) throw new ForbiddenException('Resolver role revoked');
      if (campaign.revision !== detail.revision) throw new ConflictException('Dossier revision changed');
      const [existing] = await tx.select().from(campaignReviews).where(eq(campaignReviews.campaignMetadataId, id));
      if (existing) {
        if (existing.reviewerUserId === userId && existing.decision === input.decision && existing.reason === input.reason && existing.dossierHash === input.expectedDossierHash) return existing;
        throw new ConflictException('Submission already reviewed');
      }
      const [review] = await tx.insert(campaignReviews).values({ campaignMetadataId: id, decision: input.decision,
        reason: input.reason, reviewerUserId: userId, reviewerWallet: detail.resolver.toLowerCase(), revision: detail.revision,
        dossierHash: detail.dossierHash, checkedBlock: block.number.toString(), checkedBlockHash: block.hash! }).returning();
      return review;
    });
  }

  async authorizeApproval(id: string, userId: string) {
    const detail = await this.projection.reviewDetail(id, userId);
    if (!detail.canSign) throw new ForbiddenException('Link the verified configured resolver wallet through SIWE before signing');
    if (detail.conflict || detail.review?.decision !== 'approve' || detail.review.dossierHash !== detail.dossierHash)
      throw new ForbiddenException('A matching human approval review without conflict is required');
    const { snapshot, block } = await this.confirmed(detail.campaign.plan, detail.campaign.onchainCampaignId);
    if (snapshot.chainState === 0 && (detail.checks.some(check => !check.passed) || !snapshot.bondLocked ||
      BigInt(snapshot.bondAmountUnits) < BigInt(snapshot.requiredBondUnits) || BigInt(detail.campaign.plan.fundingDeadline) <= block.timestamp))
      throw new ConflictException('System checks no longer pass; cancel and revise the unpublished campaign');
    return detail;
  }

  async revise(id: string, userId: string) {
    await this.access.assertCampaignOrganizer(id, userId);
    const publication = await this.projection.publication(id, userId);
    const [submission] = await this.database.select().from(schema.campaignSubmissions).where(eq(schema.campaignSubmissions.campaignMetadataId, id));
    const [metadata] = await this.database.select().from(campaignMetadata).where(eq(campaignMetadata.id, id));
    if (!submission || !metadata.onchainCampaignId || publication.state !== 'CANCELLED' || publication.published)
      throw new ConflictException('Cancel the unpublished campaign and wait for indexing first');
    const { snapshot } = await this.confirmed(submission.plan, metadata.onchainCampaignId);
    if (snapshot.chainState !== 5 || snapshot.bondLocked || snapshot.bondAmountUnits !== '0') throw new ConflictException('Bond cancellation is not confirmed');
    return this.database.transaction(async tx => {
      const [parent] = await tx.select().from(campaignMetadata).where(and(eq(campaignMetadata.id, id))).for('update');
      const [existing] = await tx.select().from(campaignRevisions).where(eq(campaignRevisions.parentId, id));
      if (existing) return { id: existing.childId, organizationId: parent.organizationId };
      const milestones = await tx.select().from(campaignMilestoneDrafts).where(eq(campaignMilestoneDrafts.campaignMetadataId, id)).orderBy(asc(campaignMilestoneDrafts.milestoneIndex));
      const [child] = await tx.insert(campaignMetadata).values({ organizationId: parent.organizationId, organizerUserId: parent.organizerUserId,
        createdByUserId: userId, title: parent.title, description: parent.description }).returning();
      await tx.insert(campaignMilestoneDrafts).values(milestones.map(m => ({ campaignMetadataId: child.id, milestoneIndex: m.milestoneIndex,
        title: m.title, description: m.description, budgetUnits: m.budgetUnits, acceptanceCriteria: m.acceptanceCriteria })));
      await tx.insert(campaignRevisions).values({ parentId: id, childId: child.id });
      return { id: child.id, organizationId: child.organizationId };
    });
  }
}
