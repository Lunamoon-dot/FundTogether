import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { hedReviewSchema } from "./hed-review.schema";
import { HedBlockchainService } from "./hed-blockchain.service";

const needCriteria = ["NEED-01", "NEED-02", "NEED-03", "NEED-04", "NEED-05", "NEED-06"];
const deliveryCriteria = ["DEL-01", "DEL-02", "DEL-03", "DEL-04"];
const outcomeCriteria = ["OUT-01", "OUT-02", "OUT-03", "OUT-04"];

@Injectable()
export class HedReviewService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly chain: HedBlockchainService) {}

  private async resolver(userId: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId));
    if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Current RESOLVER role required for HED review");
  }

  async list(requestId: string, userId: string) {
    await this.resolver(userId);
    return this.db.select().from(schema.hedRequestReviews).where(eq(schema.hedRequestReviews.requestDraftId, requestId))
      .orderBy(desc(schema.hedRequestReviews.createdAt));
  }

  async record(requestId: string, userId: string, input: unknown) {
    await this.resolver(userId);
    const parsed = hedReviewSchema.safeParse(input);
    if (!parsed.success) throw new ConflictException(parsed.error.flatten());
    const [request] = await this.db.select().from(schema.hedRequestDrafts).where(eq(schema.hedRequestDrafts.id, requestId));
    if (!request) throw new NotFoundException("HED request draft not found");
    if (!request.frozenAt || !request.requestHash) throw new ConflictException("Freeze HED request evidence before recording a review");
    if (!parsed.data.criterionId.startsWith("NEED")) return this.db.insert(schema.hedRequestReviews).values({ requestDraftId: requestId, content: parsed.data, reviewedBy: userId }).returning();
    const documents = await this.db.select({ id: schema.hedRequestEvidenceDocuments.id }).from(schema.hedRequestEvidenceDocuments)
      .where(eq(schema.hedRequestEvidenceDocuments.requestDraftId, requestId));
    const sourceReferences = documents.map(document => document.id).sort();
    if (!sourceReferences.length) throw new ConflictException("Frozen HED request has no server-owned need evidence");
    const content = { ...parsed.data, manifestHash: request.requestHash, publicHash: request.requestHash, sourceReferences };
    return this.db.insert(schema.hedRequestReviews).values({ requestDraftId: requestId, content, reviewedBy: userId }).returning();
  }

  async pending(userId: string) {
    await this.resolver(userId);
    const rows = await this.db.select({ requestId: schema.hedRequestDrafts.id, requestHash: schema.hedRequestDrafts.requestHash,
      content: schema.hedRequestDrafts.content, onchainRequestId: schema.disbursementRequests.onchainRequestId,
      onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId })
      .from(schema.disbursementRequests).innerJoin(schema.hedRequestDrafts, eq(schema.hedRequestDrafts.id, schema.disbursementRequests.requestDraftId))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .where(and(isNotNull(schema.hedRequestDrafts.frozenAt), isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.disbursementRequests.onchainRequestId)));
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshots = new Map<string, Awaited<ReturnType<HedBlockchainService["snapshot"]>>>();
    for (const row of rows) if (!snapshots.has(row.onchainCampaignId!)) snapshots.set(row.onchainCampaignId!, await this.chain.snapshot(BigInt(row.onchainCampaignId!), block.number));
    return rows.filter(row => snapshots.get(row.onchainCampaignId!)?.requests[Number(row.onchainRequestId!)]?.state === "SUBMITTED");
  }

  async pendingCampaigns(userId: string) {
    await this.resolver(userId);
    const rows = await this.db.select({ campaignId: schema.disbursementCampaigns.campaignMetadataId,
      onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId, commitmentHash: schema.hedCampaignDrafts.commitmentHash })
      .from(schema.disbursementCampaigns).innerJoin(schema.hedCampaignDrafts, eq(schema.hedCampaignDrafts.campaignMetadataId, schema.disbursementCampaigns.campaignMetadataId))
      .where(and(isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.hedCampaignDrafts.commitmentHash)));
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    return (await Promise.all(rows.map(async row => ({ row, snapshot: await this.chain.snapshot(BigInt(row.onchainCampaignId!), block.number) }))))
      .filter(({ snapshot }) => snapshot.campaign.state === "FUNDING" && snapshot.campaign.contributed === snapshot.campaign.goal)
      .map(({ row, snapshot }) => ({ campaignId: row.campaignId, onchainCampaignId: row.onchainCampaignId, eligibilityHash: row.commitmentHash, checkpoint: snapshot.checkpoint }));
  }

  async prepareActivation(campaignId: string, userId: string) {
    await this.resolver(userId);
    const [row] = await this.db.select({ onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId, commitmentHash: schema.hedCampaignDrafts.commitmentHash })
      .from(schema.disbursementCampaigns).innerJoin(schema.hedCampaignDrafts, eq(schema.hedCampaignDrafts.campaignMetadataId, schema.disbursementCampaigns.campaignMetadataId))
      .where(eq(schema.disbursementCampaigns.campaignMetadataId, campaignId)).limit(1);
    if (!row?.onchainCampaignId || !row.commitmentHash) throw new ConflictException("HED campaign is not frozen and mapped on chain");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(row.onchainCampaignId), block.number);
    if (snapshot.campaign.state !== "FUNDING" || snapshot.campaign.contributed !== snapshot.campaign.goal) throw new ConflictException("HED campaign is not ready for resolver activation");
    return { onchainCampaignId: row.onchainCampaignId, eligibilityHash: row.commitmentHash, checkpoint: snapshot.checkpoint };
  }

  async prepareApproval(requestId: string, userId: string) {
    await this.resolver(userId);
    const [request] = await this.db.select({ draft: schema.hedRequestDrafts, chain: schema.disbursementRequests, campaign: schema.disbursementCampaigns })
      .from(schema.hedRequestDrafts).innerJoin(schema.disbursementRequests, eq(schema.disbursementRequests.requestDraftId, schema.hedRequestDrafts.id))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.hedRequestDrafts.campaignMetadataId))
      .where(eq(schema.hedRequestDrafts.id, requestId)).limit(1);
    if (!request?.draft.frozenAt || !request.draft.requestHash || !request.chain.onchainRequestId || !request.campaign.onchainCampaignId)
      throw new ConflictException("HED request is not frozen and mapped on chain");
    const documents = await this.db.select({ id: schema.hedRequestEvidenceDocuments.id }).from(schema.hedRequestEvidenceDocuments)
      .where(eq(schema.hedRequestEvidenceDocuments.requestDraftId, requestId));
    const sourceReferences = documents.map(document => document.id).sort();
    if (!sourceReferences.length) throw new ConflictException("Frozen HED request has no server-owned need evidence");
    const reviews = await this.db.select().from(schema.hedRequestReviews).where(and(eq(schema.hedRequestReviews.requestDraftId, requestId),
      eq(sql`${schema.hedRequestReviews.content}->>'evidenceVersion'`, String(request.draft.version)), inArray(sql`${schema.hedRequestReviews.content}->>'criterionId'`, needCriteria)));
    const approved = new Set(reviews.filter(review => review.content.outcome === "MET" && review.content.manifestHash === request.draft.requestHash
      && review.content.publicHash === request.draft.requestHash && review.content.sourceReferences.length === sourceReferences.length
      && review.content.sourceReferences.every(id => sourceReferences.includes(id))).map(review => review.content.criterionId));
    if (needCriteria.some(criterion => !approved.has(criterion))) throw new ConflictException("All NEED-01 through NEED-06 reviews must be MET before reserve approval");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(request.campaign.onchainCampaignId), block.number);
    const onchain = snapshot.requests[Number(request.chain.onchainRequestId)];
    if (!onchain || onchain.requestHash.toLowerCase() !== request.draft.requestHash.toLowerCase() || onchain.state !== "SUBMITTED")
      throw new ConflictException("HED on-chain request is no longer awaiting reserve approval");
    return { onchainCampaignId: request.campaign.onchainCampaignId, onchainRequestId: request.chain.onchainRequestId, expectedRequestHash: request.draft.requestHash, checkpoint: snapshot.checkpoint };
  }

  async pendingDelivery(userId: string) {
    await this.resolver(userId);
    const rows = await this.db.select({ evidence: schema.hedEvidencePackages, request: schema.hedRequestDrafts,
      chain: schema.disbursementRequests, campaign: schema.disbursementCampaigns })
      .from(schema.hedEvidencePackages)
      .innerJoin(schema.hedRequestDrafts, eq(schema.hedRequestDrafts.id, sql`${schema.hedEvidencePackages.content}->>'requestDraftId'`))
      .innerJoin(schema.disbursementRequests, eq(schema.disbursementRequests.requestDraftId, schema.hedRequestDrafts.id))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .where(and(eq(sql`${schema.hedEvidencePackages.content}->>'kind'`, "DELIVERY"), isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.disbursementRequests.onchainRequestId)));
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshots = new Map<string, Awaited<ReturnType<HedBlockchainService["snapshot"]>>>();
    for (const row of rows) if (!snapshots.has(row.campaign.onchainCampaignId!)) snapshots.set(row.campaign.onchainCampaignId!, await this.chain.snapshot(BigInt(row.campaign.onchainCampaignId!), block.number));
    return rows.filter(row => snapshots.get(row.campaign.onchainCampaignId!)?.requests[Number(row.chain.onchainRequestId!)]?.state === "VENDOR_COMMITTED")
      .map(row => ({ packageId: row.evidence.id, requestId: row.request.id, onchainCampaignId: row.campaign.onchainCampaignId,
        onchainRequestId: row.chain.onchainRequestId, requestHash: row.request.requestHash, content: row.evidence.content }));
  }

  async prepareDelivery(packageId: string, userId: string) {
    await this.resolver(userId);
    const [evidence] = await this.db.select().from(schema.hedEvidencePackages).where(eq(schema.hedEvidencePackages.id, packageId)).limit(1);
    if (!evidence || evidence.content.kind !== "DELIVERY") throw new NotFoundException("HED delivery package not found");
    const [request] = await this.db.select({ draft: schema.hedRequestDrafts, chain: schema.disbursementRequests, campaign: schema.disbursementCampaigns })
      .from(schema.hedRequestDrafts).innerJoin(schema.disbursementRequests, eq(schema.disbursementRequests.requestDraftId, schema.hedRequestDrafts.id))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .where(and(eq(schema.hedRequestDrafts.id, evidence.content.requestDraftId), eq(schema.hedRequestDrafts.campaignMetadataId, evidence.campaignMetadataId!))).limit(1);
    if (!request?.draft.requestHash || !request.chain.onchainRequestId || !request.campaign.onchainCampaignId)
      throw new ConflictException("HED delivery package is not mapped to a frozen on-chain request");
    if (request.draft.version !== evidence.content.evidenceVersion) throw new ConflictException("Delivery package evidence version is stale for this request");
    const reviews = await this.db.select().from(schema.hedRequestReviews).where(and(eq(schema.hedRequestReviews.requestDraftId, request.draft.id),
      eq(sql`${schema.hedRequestReviews.content}->>'evidenceVersion'`, String(evidence.content.evidenceVersion)), inArray(sql`${schema.hedRequestReviews.content}->>'criterionId'`, deliveryCriteria)));
    const approved = new Set(reviews.filter(review => review.content.outcome === "MET" && review.content.manifestHash === evidence.content.manifestHash
      && review.content.publicHash === evidence.content.publicHash && review.content.sourceReferences.every(id => evidence.content.documentIds.includes(id)))
      .map(review => review.content.criterionId));
    if (deliveryCriteria.some(criterion => !approved.has(criterion))) throw new ConflictException("All DEL-01 through DEL-04 reviews must be MET for this delivery package");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(request.campaign.onchainCampaignId), block.number);
    const onchain = snapshot.requests[Number(request.chain.onchainRequestId)];
    if (!onchain || onchain.state !== "VENDOR_COMMITTED" || onchain.requestHash.toLowerCase() !== request.draft.requestHash.toLowerCase()
      || onchain.vendor.toLowerCase() !== request.chain.vendorWallet.toLowerCase() || BigInt(evidence.content.acceptedValue) > BigInt(onchain.approvedAmount))
      throw new ConflictException("HED delivery no longer matches the committed on-chain request");
    return { onchainCampaignId: request.campaign.onchainCampaignId, onchainRequestId: request.chain.onchainRequestId,
      acceptedValue: evidence.content.acceptedValue, reportHash: evidence.content.publicHash, checkpoint: snapshot.checkpoint };
  }

  async recordOutcome(activityId: string, userId: string, input: unknown) {
    await this.resolver(userId);
    const parsed = hedReviewSchema.safeParse(input);
    if (!parsed.success || !outcomeCriteria.includes(parsed.data.criterionId)) throw new ConflictException("Invalid HED outcome review");
    const [activity] = await this.db.select().from(schema.hedActivities).where(eq(schema.hedActivities.id, activityId));
    if (!activity?.onchainActivityId) throw new ConflictException("HED activity is not published on chain");
    return this.db.insert(schema.hedActivityReviews).values({ activityId, content: parsed.data, reviewedBy: userId }).returning();
  }

  async prepareOutcome(activityId: string, packageId: string, userId: string) {
    await this.resolver(userId);
    const [evidence] = await this.db.select().from(schema.hedEvidencePackages).where(eq(schema.hedEvidencePackages.id, packageId)).limit(1);
    if (!evidence || evidence.content.kind !== "OUTCOME" || evidence.content.activityId !== activityId) throw new NotFoundException("HED outcome package not found");
    const [row] = await this.db.select({ activity: schema.hedActivities, campaign: schema.disbursementCampaigns })
      .from(schema.hedActivities).innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.hedActivities.campaignMetadataId))
      .where(and(eq(schema.hedActivities.id, evidence.content.activityId), eq(schema.hedActivities.campaignMetadataId, evidence.campaignMetadataId!))).limit(1);
    if (!row?.activity.onchainActivityId || !row.campaign.onchainCampaignId) throw new ConflictException("HED outcome package is not mapped on chain");
    const reviews = await this.db.select().from(schema.hedActivityReviews).where(and(eq(schema.hedActivityReviews.activityId, row.activity.id), eq(sql`${schema.hedActivityReviews.content}->>'evidenceVersion'`, String(evidence.content.evidenceVersion)), inArray(sql`${schema.hedActivityReviews.content}->>'criterionId'`, outcomeCriteria)));
    const approved = new Set(reviews.filter(review => review.content.outcome === "MET" && review.content.manifestHash === evidence.content.manifestHash && review.content.publicHash === evidence.content.publicHash && review.content.sourceReferences.every(id => evidence.content.documentIds.includes(id))).map(review => review.content.criterionId));
    if (outcomeCriteria.some(criterion => !approved.has(criterion))) throw new ConflictException("All OUT-01 through OUT-04 reviews must be MET for this outcome package");
    const block = await this.chain.client.getBlock({ blockTag: "latest" }), snapshot = await this.chain.snapshot(BigInt(row.campaign.onchainCampaignId), block.number);
    if (snapshot.campaign.state !== "ACTIVE" || snapshot.requests.some(request => request.state !== "FINANCIALLY_SETTLED" && request.state !== "CANCELLED")) throw new ConflictException("HED activity still has an open financial request");
    return { onchainCampaignId: row.campaign.onchainCampaignId, onchainActivityId: row.activity.onchainActivityId, reportHash: evidence.content.publicHash, checkpoint: snapshot.checkpoint };
  }

  async pendingOutcomes(userId: string) {
    await this.resolver(userId);
    const rows = await this.db.select({ evidence: schema.hedEvidencePackages, activity: schema.hedActivities, campaign: schema.disbursementCampaigns })
      .from(schema.hedEvidencePackages).innerJoin(schema.hedActivities, eq(schema.hedActivities.id, sql`${schema.hedEvidencePackages.content}->>'activityId'`))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.hedActivities.campaignMetadataId))
      .where(and(eq(sql`${schema.hedEvidencePackages.content}->>'kind'`, "OUTCOME"), isNotNull(schema.disbursementCampaigns.onchainCampaignId), isNotNull(schema.hedActivities.onchainActivityId)));
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshots = new Map<string, Awaited<ReturnType<HedBlockchainService["snapshot"]>>>();
    for (const row of rows) if (!snapshots.has(row.campaign.onchainCampaignId!)) snapshots.set(row.campaign.onchainCampaignId!, await this.chain.snapshot(BigInt(row.campaign.onchainCampaignId!), block.number));
    return rows.filter(row => { const snapshot = snapshots.get(row.campaign.onchainCampaignId!); return snapshot?.campaign.state === "ACTIVE" && snapshot.requests.every(request => request.state === "FINANCIALLY_SETTLED" || request.state === "CANCELLED"); })
      .map(row => ({ packageId: row.evidence.id, activityId: row.activity.id, onchainCampaignId: row.campaign.onchainCampaignId, onchainActivityId: row.activity.onchainActivityId, content: row.evidence.content }));
  }
}
