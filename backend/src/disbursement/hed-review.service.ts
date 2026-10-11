import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { hedReviewSchema } from "./hed-review.schema";
import { HedBlockchainService } from "./hed-blockchain.service";

const needCriteria = ["NEED-01", "NEED-02", "NEED-03", "NEED-04", "NEED-05"];

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
    return this.db.insert(schema.hedRequestReviews).values({ requestDraftId: requestId, content: parsed.data, reviewedBy: userId }).returning();
  }

  async pending(userId: string) {
    await this.resolver(userId);
    return this.db.select({ requestId: schema.hedRequestDrafts.id, requestHash: schema.hedRequestDrafts.requestHash,
      amount: schema.hedRequestDrafts.content, onchainRequestId: schema.disbursementRequests.onchainRequestId,
      onchainCampaignId: schema.disbursementCampaigns.onchainCampaignId })
      .from(schema.disbursementRequests).innerJoin(schema.hedRequestDrafts, eq(schema.hedRequestDrafts.id, schema.disbursementRequests.requestDraftId))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.disbursementRequests.campaignMetadataId))
      .where(isNotNull(schema.hedRequestDrafts.frozenAt));
  }

  async prepareApproval(requestId: string, userId: string) {
    await this.resolver(userId);
    const [request] = await this.db.select({ draft: schema.hedRequestDrafts, chain: schema.disbursementRequests, campaign: schema.disbursementCampaigns })
      .from(schema.hedRequestDrafts).innerJoin(schema.disbursementRequests, eq(schema.disbursementRequests.requestDraftId, schema.hedRequestDrafts.id))
      .innerJoin(schema.disbursementCampaigns, eq(schema.disbursementCampaigns.campaignMetadataId, schema.hedRequestDrafts.campaignMetadataId))
      .where(eq(schema.hedRequestDrafts.id, requestId)).limit(1);
    if (!request?.draft.frozenAt || !request.draft.requestHash || !request.chain.onchainRequestId || !request.campaign.onchainCampaignId)
      throw new ConflictException("HED request is not frozen and mapped on chain");
    const reviews = await this.db.select().from(schema.hedRequestReviews).where(and(eq(schema.hedRequestReviews.requestDraftId, requestId),
      eq(sql`${schema.hedRequestReviews.content}->>'evidenceVersion'`, String(request.draft.version)), inArray(sql`${schema.hedRequestReviews.content}->>'criterionId'`, needCriteria)));
    const approved = new Set(reviews.filter(review => review.content.outcome === "MET").map(review => review.content.criterionId));
    if (needCriteria.some(criterion => !approved.has(criterion))) throw new ConflictException("All NEED-01 through NEED-05 reviews must be MET before reserve approval");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(request.campaign.onchainCampaignId), block.number);
    const onchain = snapshot.requests[Number(request.chain.onchainRequestId)];
    if (!onchain || onchain.requestHash.toLowerCase() !== request.draft.requestHash.toLowerCase() || onchain.state !== "SUBMITTED")
      throw new ConflictException("HED on-chain request is no longer awaiting reserve approval");
    return { onchainCampaignId: request.campaign.onchainCampaignId, onchainRequestId: request.chain.onchainRequestId, expectedRequestHash: request.draft.requestHash, checkpoint: snapshot.checkpoint };
  }
}
