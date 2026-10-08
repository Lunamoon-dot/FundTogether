import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BlockchainService, criteriaReady, matchesSubmission } from '../../blockchain/blockchain.service';
import { DRIZZLE_DB } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { campaignChainProjection, campaignMetadata, campaignMilestoneDrafts, campaignSubmissions, organizations, organizationMembers, walletLinks, platformRoles, campaignReviews, chainEvents } from '../../database/schema';
import { IndexerService } from '../../indexer/indexer.service';
import type { IndexerStatus } from '../../indexer/indexer.service';
import { EvidenceAccessService } from '../evidence/evidence-access.service';
import { criteriaCommitment } from './submission-plan';
import { deploymentAnchorMatches, MVP_MILESTONE_POLICY } from '../../blockchain/blockchain.constants';

const STATES = ['DRAFT', 'APPROVED', 'FUNDING', 'FUNDED', 'FUNDING_FAILED', 'CANCELLED', 'MILESTONE_ACTIVE',
  'IN_REVIEW', 'CHALLENGED', 'MILESTONE_SETTLED', 'COMPLETED', 'EVIDENCE_PENDING', 'FAILED'];

@Injectable()
export class CampaignProjectionService {
  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>,
    private readonly chain: BlockchainService, private readonly indexer: IndexerService, private readonly access: EvidenceAccessService) {}

  async reviewAccess(userId: string) {
    const [staff] = await this.database.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    const roles = staff?.roles ?? [];
    await this.chain.verifyDeployment();
    const resolver = String(await this.chain.read('resolver', []));
    const [link] = await this.database.select({ id: walletLinks.id }).from(walletLinks).where(and(
      eq(walletLinks.userId, userId), eq(walletLinks.address, resolver.toLowerCase()), eq(walletLinks.chainId, String(this.chain.deployment.chainId)),
    )).limit(1);
    return { allowed: roles.includes('RESOLVER'), staff: roles.length > 0, roles, canSign: Boolean(link), resolver };
  }

  private async requireResolver(userId: string) {
    const access = await this.reviewAccess(userId);
    if (!access.allowed) throw new ForbiddenException('RESOLVER application role required');
    return access.resolver;
  }

  private async ensureStable(before: IndexerStatus) {
    const after = await this.indexer.status();
    if (before.lastIndexedBlock !== after.lastIndexedBlock || before.lastIndexedBlockHash !== after.lastIndexedBlockHash)
      throw new ServiceUnavailableException('Indexer advanced or rebuilt while reading. Retry with a consistent checkpoint.');
    return after;
  }

  private async rows(metadataId?: string) {
    return this.database.select({ projection: campaignChainProjection, campaign: campaignMetadata, submission: campaignSubmissions,
      organization: { id: organizations.id, name: organizations.name } }).from(campaignChainProjection)
      .innerJoin(campaignMetadata, eq(campaignChainProjection.metadataId, campaignMetadata.id))
      .innerJoin(campaignSubmissions, eq(campaignSubmissions.campaignMetadataId, campaignMetadata.id))
      .innerJoin(organizations, eq(organizations.id, campaignMetadata.organizationId))
      .where(and(eq(campaignChainProjection.streamId, this.indexer.streamKey), metadataId ? eq(campaignMetadata.id, metadataId) : undefined));
  }

  private async describe(row: Awaited<ReturnType<CampaignProjectionService['rows']>>[number]) {
    const plan = row.submission.plan;
    const snapshot = row.projection.snapshot;
    const deployment = this.chain.deployment;
    if (plan.chainId !== deployment.chainId || plan.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase() ||
        plan.genesisHash !== deployment.genesisHash || plan.contractCodeHash !== deployment.contractCodeHash || plan.tokenCodeHash !== deployment.tokenCodeHash ||
        !deploymentAnchorMatches(plan, deployment) || row.campaign.title !== plan.title || !matchesSubmission(plan, snapshot) || !criteriaReady(plan, snapshot)) return null;
    const milestones = await this.database.select().from(campaignMilestoneDrafts)
      .where(eq(campaignMilestoneDrafts.campaignMetadataId, row.campaign.id)).orderBy(asc(campaignMilestoneDrafts.milestoneIndex));
    if (milestones.length !== plan.budgetUnits.length || milestones.some((milestone, index) =>
      milestone.milestoneIndex !== index || milestone.budgetUnits !== plan.budgetUnits[index] || criteriaCommitment(milestone) !== plan.criteriaHashes[index])) return null;
    return { id: row.campaign.id, title: plan.title, description: row.campaign.description,
      organization: row.organization, chainId: plan.chainId, contractAddress: plan.contractAddress,
      onchainCampaignId: row.projection.onchainCampaignId, organizer: snapshot.organizer, tokenAddress: snapshot.token,
      goalUnits: snapshot.goalUnits, requiredBondUnits: snapshot.requiredBondUnits, bondAmountUnits: snapshot.bondAmountUnits,
      totalContributedUnits: snapshot.totalContributedUnits, state: STATES[snapshot.chainState], fundingDeadline: plan.fundingDeadline,
      publicationTransactionHash: snapshot.publicationTransactionHash, indexedBlock: snapshot.indexedBlock,
      milestones: milestones.map(m => ({ index: m.milestoneIndex, title: m.title, description: m.description,
        budgetUnits: m.budgetUnits!, acceptanceCriteria: m.acceptanceCriteria })) };
  }

  async publicList(limit: number, offset: number) {
    const sync = await this.indexer.status();
    const rows = (await this.rows()).filter(row => row.projection.snapshot.published && row.projection.snapshot.publicationTransactionHash);
    rows.sort((a, b) => a.campaign.createdAt.getTime() - b.campaign.createdAt.getTime() || a.campaign.id.localeCompare(b.campaign.id));
    const valid = [];
    for (const row of rows) { const item = await this.describe(row); if (item) valid.push(item); }
    await this.ensureStable(sync);
    return { items: valid.slice(offset, offset + limit), sync };
  }

  async publicDetail(metadataId: string) {
    const sync = await this.indexer.status();
    const [row] = await this.rows(metadataId);
    const campaign = row?.projection.snapshot.published && row.projection.snapshot.publicationTransactionHash ? await this.describe(row) : null;
    if (!campaign) throw new NotFoundException('Published campaign not found');
    const workflow = await this.workflow(campaign.onchainCampaignId, campaign.state, sync);
    await this.ensureStable(sync);
    return { campaign, workflow, sync };
  }

  private async workflow(campaignId: string, expectedState: string, sync: IndexerStatus) {
    if (sync.lastIndexedBlock === null) throw new ServiceUnavailableException('Campaign checkpoint is not available yet.');
    const blockNumber = BigInt(sync.lastIndexedBlock);
    const block = await this.chain.client.getBlock({ blockNumber });
    const id = BigInt(campaignId);
    const [state, currentIndex, activation, snapshotted, pool, released] = await Promise.all([
      this.chain.read('campaignState', [id], blockNumber), this.chain.read('currentMilestoneIndex', [id], blockNumber),
      this.chain.read('activationDeadlines', [id], blockNumber), this.chain.read('refundSnapshotted', [id], blockNumber),
      this.chain.read('refundPool', [id], blockNumber), this.chain.read('totalReleased', [id], blockNumber),
    ]);
    if (STATES[Number(state)] !== expectedState) throw new ServiceUnavailableException('Campaign state does not match its indexed projection. Retry.');
    const index = currentIndex as bigint;
    const [evidence, admissionVersion, review] = await Promise.all([
      this.chain.read('evidenceDeadlines', [id, index], blockNumber),
      this.chain.read('submissionVersion', [id, index], blockNumber),
      this.chain.read('milestoneEvidence', [id, index], blockNumber),
    ]);
    const version = admissionVersion as bigint;
    const admission = version > 0n ? await this.chain.read('admissionDeadlines', [id, index, version], blockNumber) : 0n;
    const milestoneMvp = this.chain.deployment.milestonePolicy === MVP_MILESTONE_POLICY;
    let caseDeadlines: { responseDeadline: string; resolutionDeadline: string; resolver: string } | null = null;
    if (milestoneMvp) {
      const [dispute, resolver] = await Promise.all([this.chain.read('challengeCases', [id, index, version], blockNumber), this.chain.read('resolver', [], blockNumber)]);
      caseDeadlines = { responseDeadline: String((dispute as unknown[])[4]), resolutionDeadline: String((dispute as unknown[])[5]), resolver: String(resolver) };
    }
    const activations = await this.database.select().from(chainEvents).where(and(
      eq(chainEvents.streamId, this.indexer.streamKey), eq(chainEvents.eventName, 'MilestoneActivated'), eq(chainEvents.canonical, true),
    ));
    const activationEvent = activations.find(event => String(event.args.campaignId) === campaignId &&
      String(event.args.milestoneIndex) === index.toString() && BigInt(event.blockNumber) <= blockNumber);
    if (block.hash !== sync.lastIndexedBlockHash || (await this.chain.client.getBlock({ blockNumber })).hash !== block.hash)
      throw new ServiceUnavailableException('Campaign checkpoint changed. Retry.');
    return { checkedBlock: sync.lastIndexedBlock, checkedBlockHash: block.hash, chainTimestamp: block.timestamp.toString(),
      currentMilestoneIndex: index.toString(), activationDeadline: String(activation), evidenceDeadline: String(evidence),
      admissionDeadline: String(admission), reviewDeadline: String((review as readonly unknown[])[1]),
      milestoneMvp, caseDeadlines,
      activationTransactionHash: activationEvent?.transactionHash ?? null,
      refundSnapshotted: Boolean(snapshotted), refundPoolUnits: String(pool), releasedUnits: String(released) };
  }

  async donorContributions(userId: string) {
    const sync = await this.indexer.status();
    const links = await this.database.select({ address: walletLinks.address }).from(walletLinks).where(and(
      eq(walletLinks.userId, userId), eq(walletLinks.chainId, String(this.chain.deployment.chainId)),
    ));
    const addresses = new Set(links.map(link => link.address.toLowerCase()));
    const events = await this.database.select().from(chainEvents).where(and(
      eq(chainEvents.streamId, this.indexer.streamKey), eq(chainEvents.eventName, 'DonationReceived'), eq(chainEvents.canonical, true),
    ));
    const campaigns = new Map<string, { id: string; title: string; organization: string }>();
    for (const row of await this.rows()) {
      if (!row.projection.snapshot.published || !row.projection.snapshot.publicationTransactionHash) continue;
      const campaign = await this.describe(row);
      if (campaign) campaigns.set(row.projection.onchainCampaignId, { id: campaign.id, title: campaign.title, organization: campaign.organization.name });
    }
    const items = events.flatMap(event => {
      const donor = String(event.args.donor ?? '').toLowerCase();
      const campaign = campaigns.get(String(event.args.campaignId ?? ''));
      if (!addresses.has(donor) || !campaign || !/^[0-9]+$/.test(String(event.args.amount ?? ''))) return [];
      return [{ ...campaign, donor, amountUnits: String(event.args.amount), transactionHash: event.transactionHash,
        blockNumber: event.blockNumber, logIndex: event.logIndex }];
    }).sort((a, b) => BigInt(a.blockNumber) === BigInt(b.blockNumber)
      ? b.logIndex - a.logIndex : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1);
    await this.ensureStable(sync);
    return { items, sync };
  }

  async donorRefunds(userId: string, metadataId?: string) {
    const sync = await this.indexer.status();
    if (sync.lastIndexedBlock === null) throw new ServiceUnavailableException('Refund checkpoint is not available yet.');
    const blockNumber = BigInt(sync.lastIndexedBlock);
    const block = await this.chain.client.getBlock({ blockNumber });
    const links = await this.database.select({ address: walletLinks.address }).from(walletLinks).where(and(
      eq(walletLinks.userId, userId), eq(walletLinks.chainId, String(this.chain.deployment.chainId)),
    ));
    const events = await this.database.select().from(chainEvents).where(and(
      eq(chainEvents.streamId, this.indexer.streamKey), or(eq(chainEvents.eventName, 'DonationReceived'), eq(chainEvents.eventName, 'RefundClaimed'), eq(chainEvents.eventName, 'RefundPoolSnapshotted')), eq(chainEvents.canonical, true),
    ));
    const addresses = new Set(links.map(link => link.address.toLowerCase()));
    const donatedCampaigns = new Set(events.filter(event => event.eventName === 'DonationReceived' &&
      addresses.has(String(event.args.donor).toLowerCase()) && BigInt(event.blockNumber) <= blockNumber).map(event => String(event.args.campaignId)));
    const items = [];
    for (const row of await this.rows(metadataId)) {
      if (!metadataId && !donatedCampaigns.has(row.projection.onchainCampaignId)) continue;
      if (!row.projection.snapshot.published || !row.projection.snapshot.publicationTransactionHash) continue;
      const campaign = await this.describe(row);
      if (!campaign) continue;
      const id = BigInt(campaign.onchainCampaignId);
      const [snapshot, pool, released, state, currentMilestone] = await Promise.all([
        this.chain.read('refundSnapshotted', [id], blockNumber), this.chain.read('refundPool', [id], blockNumber),
        this.chain.read('totalReleased', [id], blockNumber), this.chain.read('campaignState', [id], blockNumber),
        this.chain.read('currentMilestoneIndex', [id], blockNumber),
      ]);
      const timeoutState = [3, 6, 9].includes(Number(state));
      const milestoneDeadline = timeoutState ? await this.chain.read(Number(state) === 6 ? 'evidenceDeadlines' : 'activationDeadlines',
        Number(state) === 6 ? [id, currentMilestone] : [id], blockNumber) as bigint : 0n;
      const wallets = await Promise.all(links.map(async link => {
        const donor = link.address.toLowerCase();
        const [contribution, claimed] = await Promise.all([
          this.chain.read('contributions', [id, donor], blockNumber), this.chain.read('claimedRefund', [id, donor], blockNumber),
        ]) as [bigint, boolean];
        const total = BigInt(campaign.totalContributedUnits);
        const entitlement = snapshot && total > 0n ? contribution * (pool as bigint) / total : 0n;
        const claim = events.find(event => event.eventName === 'RefundClaimed' && String(event.args.campaignId) === campaign.onchainCampaignId &&
          String(event.args.donor).toLowerCase() === donor && BigInt(event.blockNumber) <= blockNumber &&
          String(event.args.amount) === entitlement.toString());
        // A chain flag alone does not prove that a canonical claim event was indexed.
        if (claimed !== Boolean(claim)) throw new ServiceUnavailableException('Refund event has not been reconciled with the checkpoint.');
        return { donor, contributionUnits: contribution.toString(), entitlementUnits: entitlement.toString(),
          claimableUnits: snapshot && !claimed ? entitlement.toString() : '0', claimed,
          transactionHash: claim?.transactionHash ?? null, blockNumber: claim?.blockNumber ?? null };
      }));
      if (!metadataId && !wallets.some(wallet => BigInt(wallet.contributionUnits) > 0n)) continue;
      const snapshotEvent = events.find(event => event.eventName === 'RefundPoolSnapshotted' &&
        String(event.args.campaignId) === campaign.onchainCampaignId && String(event.args.amount) === String(pool) && BigInt(event.blockNumber) <= blockNumber);
      if (snapshot && !snapshotEvent) throw new ServiceUnavailableException('Refund snapshot event has not been reconciled.');
      items.push({ campaign, snapshotted: Boolean(snapshot), poolUnits: String(pool), releasedUnits: String(released),
        snapshotTransactionHash: snapshotEvent?.transactionHash ?? null,
        currentMilestoneIndex: String(currentMilestone), milestoneDeadline: milestoneDeadline.toString(),
        canFinalizeMilestone: timeoutState && milestoneDeadline > 0n && block.timestamp >= milestoneDeadline,
        checkedBlock: sync.lastIndexedBlock, checkedBlockHash: block.hash, chainTimestamp: block.timestamp.toString(),
        canFinalizeFunding: Number(state) === 2 && block.timestamp >= BigInt(campaign.fundingDeadline) &&
          BigInt(campaign.totalContributedUnits) < BigInt(campaign.goalUnits), wallets });
    }
    await this.ensureStable(sync);
    if (block.hash !== sync.lastIndexedBlockHash) throw new ServiceUnavailableException('Refund checkpoint changed. Retry.');
    if (metadataId && items.length === 0) throw new NotFoundException('Published campaign not found');
    return { items, sync };
  }

  async reviewList(userId: string) {
    const resolver = await this.requireResolver(userId);
    const sync = await this.indexer.status();
    const items = [];
    const history = [];
    for (const row of await this.rows()) {
      const snapshot = row.projection.snapshot;
      const [review] = await this.database.select().from(campaignReviews).where(eq(campaignReviews.campaignMetadataId, row.campaign.id));
      const eligible = snapshot.chainState === 0 && snapshot.bondLocked && BigInt(snapshot.bondAmountUnits) >= BigInt(snapshot.requiredBondUnits);
      if (!eligible && !review) continue;
      const campaign = await this.describe(row);
      if (!campaign) continue;
      if (eligible && (!review || review.decision === 'approve')) items.push({ ...campaign, plan: row.submission.plan, review: review ?? null });
      if (review) history.push({ ...campaign, review });
    }
    await this.ensureStable(sync);
    return { items, history, resolver, sync };
  }

  async reviewDetail(metadataId: string, userId: string) {
    const resolver = await this.requireResolver(userId);
    const sync = await this.indexer.status();
    const [row] = await this.rows(metadataId);
    const snapshot = row?.projection.snapshot;
    const eligible = snapshot && (snapshot.chainState !== 0 || (snapshot.bondLocked && BigInt(snapshot.bondAmountUnits) >= BigInt(snapshot.requiredBondUnits)));
    const campaign = row && eligible ? await this.describe(row) : null;
    await this.ensureStable(sync);
    if (!row || !campaign) throw new NotFoundException('Matching submitted campaign not found');
    const [membership] = await this.database.select().from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, row.campaign.organizationId!), eq(organizationMembers.userId, userId),
    ));
    const conflict = Boolean(membership || row.campaign.createdByUserId === userId || row.campaign.organizerUserId === userId ||
      row.submission.plan.organizer.toLowerCase() === resolver.toLowerCase());
    const [review] = await this.database.select().from(campaignReviews).where(eq(campaignReviews.campaignMetadataId, metadataId));
    const [resolverWalletLink] = await this.database.select({ id: walletLinks.id }).from(walletLinks).where(and(
      eq(walletLinks.userId, userId), eq(walletLinks.address, resolver.toLowerCase()), eq(walletLinks.chainId, String(this.chain.deployment.chainId)),
    )).limit(1);
    const dossierHash = createHash('sha256').update(JSON.stringify({ revision: row.campaign.revision,
      description: row.campaign.description, organizationId: row.organization.id, plan: row.submission.plan, milestones: campaign.milestones })).digest('hex');
    const currentBlock = await this.chain.client.getBlock({ blockTag: 'latest' });
    await this.ensureStable(sync);
    return { campaign: { ...campaign, plan: row.submission.plan }, resolver, sync, review: review ?? null, dossierHash: `0x${dossierHash}`,
      revision: row.campaign.revision, conflict, canSign: Boolean(resolverWalletLink),
      checks: [
        { label: 'Deployment, token, danh tính campaign và hồ sơ đã chốt khớp chain', passed: true },
        { label: 'Ngân sách và tiêu chí từng milestone khớp commitment', passed: true },
        { label: 'Bond đã nằm trong escrow và đủ ngân sách milestone lớn nhất', passed: snapshot!.bondLocked && BigInt(snapshot!.bondAmountUnits) >= BigInt(snapshot!.requiredBondUnits) },
        { label: 'Hạn gây quỹ còn hiệu lực theo thời gian chain', passed: BigInt(row.submission.plan.fundingDeadline) > currentBlock.timestamp },
        { label: 'Người duyệt không tạo hoặc đại diện tổ chức của campaign', passed: !conflict },
      ] };
  }

  async publication(metadataId: string, userId: string) {
    await this.access.assertCampaignOrganizer(metadataId, userId);
    const sync = await this.indexer.status();
    const [row] = await this.rows(metadataId);
    const valid = row ? await this.describe(row) : null;
    await this.ensureStable(sync);
    const [review] = await this.database.select().from(campaignReviews).where(eq(campaignReviews.campaignMetadataId, metadataId));
    return { review: review ?? null, state: valid?.state ?? null, indexedBlock: valid?.indexedBlock ?? null,
      published: Boolean(valid && row.projection.snapshot.published), publicId: valid && row.projection.snapshot.published ? metadataId : null, sync };
  }
}
