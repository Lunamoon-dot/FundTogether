import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as schema from "../../../database/schema";
import { campaignEntitlements, campaignFeedback, reviewEscalations, reviewMessages, reviewThreads, platformRoles, campaigns } from "../../../database/schema";
import { DRIZZLE_DB } from "../../../database/database.constants";
import { currentFeedbackTargets } from "../../delivery/policies/delivery.policy";
import {
  canOpenReviewThread,
  decodeReviewMessagesCursor,
  deriveReviewThreadWriteState,
  encodeReviewMessagesCursor,
  MAX_REVIEW_MESSAGES_PER_THREAD,
  type ReviewThreadWriteState,
} from "../policies/review-conversation.policy";
import { CampaignIndexerService } from "../../../indexer/campaign-indexer.service";
import { PublicationService } from "../../campaigns/services/publication.service";
import {
  campaignReviewEscalationOutcomeSchema,
  campaignReviewEscalationSchema,
  campaignReviewMessageSchema,
  campaignReviewMessageSchema as reviewMessageSchema,
  campaignReviewThreadOpenSchema,
  campaignReviewThreadQuerySchema,
} from "../../campaigns/schemas/preparation.schema";

type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
const zeroHash = `0x${"0".repeat(64)}`;

type ReviewThreadPermissions = {
  canMessage: boolean;
  canEscalate: boolean;
  readOnlyReason: "REFUNDED" | "ORPHANED" | "CLOSED" | "RESOLVED" | null;
};

function parse<T extends z.ZodType>(schemaType: T, body: unknown): z.output<T> {
  const result = schemaType.safeParse(body);
  if (!result.success) throw new BadRequestException("A bounded review message, reason or current target is required");
  return result.data;
}

@Injectable()
export class ReviewConversationService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly indexer: CampaignIndexerService,
    private readonly publication: PublicationService,
  ) {}

  private async campaign(db: NodePgDatabase<typeof schema> | Transaction, campaignId: string) {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign?.draftConfig || campaign.category !== "COMICS_ARTBOOK") throw new NotFoundException("Campaign campaign not found");
    return campaign;
  }

  private async resolver(db: NodePgDatabase<typeof schema> | Transaction, userId: string) {
    const [role] = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    return role?.roles.includes("RESOLVER") === true;
  }

  private async canonicalBacker(campaignId: string, userId: string) {
    const campaign = await this.campaign(this.db, campaignId);
    if (campaign.status !== "APPROVED") throw new ConflictException("Review threads open only after the campaign is funded");
    const chain = await this.publication.chainCampaign(campaignId);
    const [entitlement] = await this.db.select().from(campaignEntitlements).where(and(
      eq(campaignEntitlements.campaignId, campaignId),
      eq(campaignEntitlements.streamId, this.indexer.streamId()),
      eq(campaignEntitlements.backerUserId, userId),
      eq(campaignEntitlements.canonical, true),
      eq(campaignEntitlements.refunded, false),
    ));
    const allowed = canOpenReviewThread({
      userId,
      creatorUserId: campaign.creatorUserId,
      publicationStatus: chain.status,
      chainState: chain.snapshot?.state ?? null,
      entitlement: entitlement ? { backerUserId: entitlement.backerUserId, canonical: entitlement.canonical, refunded: entitlement.refunded } : null,
    });
    if (!allowed || !entitlement || !chain.snapshot || !campaign.frozenSnapshot || !campaign.commitmentHash)
      throw new ConflictException("A canonical funded Campaign entitlement is required for review");
    return { campaign, chain, entitlement };
  }

  private async threadWriteState(db: NodePgDatabase<typeof schema> | Transaction, thread: typeof reviewThreads.$inferSelect): Promise<ReviewThreadWriteState> {
    const [entitlement] = await db.select({
      canonical: campaignEntitlements.canonical,
      refunded: campaignEntitlements.refunded,
      streamId: campaignEntitlements.streamId,
    }).from(campaignEntitlements).where(eq(campaignEntitlements.id, thread.entitlementId));
    if (!entitlement) return "ORPHANED";
    return deriveReviewThreadWriteState({
      canonical: entitlement.canonical,
      refunded: entitlement.refunded,
      entitlementStreamId: entitlement.streamId,
      currentStreamId: this.indexer.streamId(),
    });
  }

  private async detail(db: NodePgDatabase<typeof schema> | Transaction, threadId: string, viewerUserId?: string, rawQuery: unknown = {}) {
    const [thread] = await db.select().from(reviewThreads).where(eq(reviewThreads.id, threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const query = parse(campaignReviewThreadQuerySchema, rawQuery);
    let cursor: ReturnType<typeof decodeReviewMessagesCursor> | undefined;
    if (query.cursor) {
      try {
        cursor = decodeReviewMessagesCursor(query.cursor);
      } catch {
        throw new BadRequestException("Invalid review message cursor");
      }
    }
    const rows = cursor
      ? await db.select().from(reviewMessages).where(and(
        eq(reviewMessages.threadId, threadId),
        or(
          lt(reviewMessages.createdAt, new Date(cursor.createdAt)),
          and(eq(reviewMessages.createdAt, new Date(cursor.createdAt)), lt(reviewMessages.id, cursor.id)),
        ),
      )).orderBy(desc(reviewMessages.createdAt), desc(reviewMessages.id)).limit(query.limit + 1)
      : await db.select().from(reviewMessages).where(eq(reviewMessages.threadId, threadId))
        .orderBy(desc(reviewMessages.createdAt), desc(reviewMessages.id)).limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const messages = [...pageRows].reverse();
    const nextCursor = hasMore && messages.length
      ? encodeReviewMessagesCursor({ createdAt: messages[0].createdAt.toISOString(), id: messages[0].id })
      : null;
    const [escalation] = await db.select().from(reviewEscalations).where(eq(reviewEscalations.threadId, threadId));
    const participant = viewerUserId === thread.backerUserId || viewerUserId === thread.creatorUserId;
    let canMessage = participant && thread.status !== "CLOSED";
    let canEscalate = viewerUserId === thread.backerUserId && !["RESOLVED", "CLOSED"].includes(thread.status);
    let readOnlyReason: ReviewThreadPermissions["readOnlyReason"] = thread.status === "CLOSED" ? "CLOSED" : null;
    if (canMessage || canEscalate) {
      const state = await this.threadWriteState(db, thread);
      if (state !== "ACTIVE") {
        canMessage = false;
        canEscalate = false;
        readOnlyReason = state;
      }
    }
    const permissions: ReviewThreadPermissions = { canMessage, canEscalate, readOnlyReason };
    return {
      ...thread,
      messages,
      hasMore,
      nextCursor,
      escalation: escalation ?? null,
      permissions,
    };
  }

  private async authorizedThread(db: NodePgDatabase<typeof schema> | Transaction, threadId: string, userId: string) {
    const [thread] = await db.select().from(reviewThreads).where(eq(reviewThreads.id, threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const participant = thread.backerUserId === userId || thread.creatorUserId === userId;
    if (!participant && !(await this.resolver(db, userId))) throw new ForbiddenException("Review thread participant or Resolver required");
    return { thread, participant };
  }

  private async assertActiveThreadEntitlement(db: NodePgDatabase<typeof schema> | Transaction, thread: typeof reviewThreads.$inferSelect) {
    const [entitlement] = await db.select({
      canonical: campaignEntitlements.canonical,
      refunded: campaignEntitlements.refunded,
      streamId: campaignEntitlements.streamId,
    }).from(campaignEntitlements).where(eq(campaignEntitlements.id, thread.entitlementId));
    const state = entitlement ? deriveReviewThreadWriteState({
      canonical: entitlement.canonical,
      refunded: entitlement.refunded,
      entitlementStreamId: entitlement.streamId,
      currentStreamId: this.indexer.streamId(),
    }) : "ORPHANED";
    if (state !== "ACTIVE") throw new ConflictException(`Review thread is read-only because entitlement is ${state}`);
  }

  private async appendMessage(
    tx: Transaction,
    threadId: string,
    authorUserId: string,
    authorRole: "BACKER" | "CREATOR" | "RESOLVER",
    body: string,
  ) {
    const [reserved] = await tx.update(reviewThreads).set({
      messageCount: sql`${reviewThreads.messageCount} + 1`,
      updatedAt: new Date(),
    }).where(and(
      eq(reviewThreads.id, threadId),
      lt(reviewThreads.messageCount, MAX_REVIEW_MESSAGES_PER_THREAD),
    )).returning({ id: reviewThreads.id, messageCount: reviewThreads.messageCount });
    if (!reserved || reserved.messageCount > MAX_REVIEW_MESSAGES_PER_THREAD) {
      throw new ConflictException("Review thread message limit reached");
    }
    const [message] = await tx.insert(reviewMessages).values({ threadId, authorUserId, authorRole, body }).returning({ id: reviewMessages.id });
    return message.id;
  }

  async openThread(campaignId: string, userId: string, body: unknown) {
    const input = parse(campaignReviewThreadOpenSchema, body);
    const { campaign, chain, entitlement } = await this.canonicalBacker(campaignId, userId);
    const targets = currentFeedbackTargets({
      commitmentHash: campaign.commitmentHash,
      frozenSnapshot: campaign.frozenSnapshot,
      chain: { snapshot: chain.snapshot, challenges: chain.challenges },
      zeroHash,
    });
    if (!targets.has(input.targetHash)) throw new ConflictException("Review thread must identify a current campaign or evidence target");

    let threadId: string;
    await this.db.transaction(async tx => {
      const [existing] = await tx.select({ id: reviewThreads.id }).from(reviewThreads).where(and(
        eq(reviewThreads.campaignId, campaignId), eq(reviewThreads.entitlementId, entitlement.id), eq(reviewThreads.targetHash, input.targetHash),
      ));
      if (existing) { threadId = existing.id; return; }
      const [thread] = await tx.insert(reviewThreads).values({ campaignId, entitlementId: entitlement.id,
        backerUserId: userId, creatorUserId: campaign.creatorUserId, targetHash: input.targetHash, commitmentHash: campaign.commitmentHash!, status: "OPEN", messageCount: 1 }).returning({ id: reviewThreads.id });
      await tx.insert(reviewMessages).values({ threadId: thread.id, authorUserId: userId, authorRole: "BACKER", body: input.body });
      threadId = thread.id;
    });
    return this.detail(this.db, threadId!, userId);
  }

  async thread(threadId: string, userId: string, query: unknown = {}) {
    await this.authorizedThread(this.db, threadId, userId);
    return this.detail(this.db, threadId, userId, query);
  }

  async listThreads(campaignId: string, userId: string, query: unknown = {}) {
    const campaign = await this.campaign(this.db, campaignId);
    const resolver = await this.resolver(this.db, userId);
    const threads = await this.db.select({ id: reviewThreads.id }).from(reviewThreads).where(
      resolver || campaign.creatorUserId === userId
        ? eq(reviewThreads.campaignId, campaignId)
        : and(eq(reviewThreads.campaignId, campaignId), eq(reviewThreads.backerUserId, userId)),
    );
    return Promise.all(threads.map(thread => this.detail(this.db, thread.id, userId, query)));
  }

  async message(threadId: string, userId: string, body: unknown) {
    const input = parse(campaignReviewMessageSchema, body);
    let messageId: string;
    await this.db.transaction(async tx => {
      const { thread } = await this.authorizedThread(tx, threadId, userId);
      if (thread.status === "CLOSED") throw new ConflictException("Closed review threads cannot receive messages");
      const authorRole = thread.backerUserId === userId ? "BACKER" : thread.creatorUserId === userId ? "CREATOR" : null;
      if (!authorRole) throw new ForbiddenException("Only the Backer and Creator can message this thread");
      await this.assertActiveThreadEntitlement(tx, thread);
      messageId = await this.appendMessage(tx, threadId, userId, authorRole, input.body);
    });
    const [message] = await this.db.select().from(reviewMessages).where(eq(reviewMessages.id, messageId!));
    return message;
  }

  async escalate(threadId: string, userId: string, body: unknown) {
    const input = parse(campaignReviewEscalationSchema, body);
    let escalationId: string;
    await this.db.transaction(async tx => {
      const { thread } = await this.authorizedThread(tx, threadId, userId);
      if (thread.backerUserId !== userId) throw new ForbiddenException("Only the Backer can escalate a review thread");
      if (["RESOLVED", "CLOSED"].includes(thread.status)) throw new ConflictException("This review thread is already closed");
      await this.assertActiveThreadEntitlement(tx, thread);
      const [existing] = await tx.select().from(reviewEscalations).where(eq(reviewEscalations.threadId, threadId));
      if (existing) { escalationId = existing.id; return; }
      const [saved] = await tx.insert(reviewEscalations).values({ threadId, openerUserId: userId, reason: input.reason, status: "OPEN" }).returning({ id: reviewEscalations.id });
      await tx.update(reviewThreads).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(reviewThreads.id, threadId));
      escalationId = saved.id;
    });
    const [escalation] = await this.db.select().from(reviewEscalations).where(eq(reviewEscalations.id, escalationId!));
    return escalation;
  }

  private async escalationCase(escalationId: string) {
    const [escalation] = await this.db.select().from(reviewEscalations).where(eq(reviewEscalations.id, escalationId));
    if (!escalation) throw new NotFoundException("Resolver case not found");
    const [thread] = await this.db.select().from(reviewThreads).where(eq(reviewThreads.id, escalation.threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const campaign = await this.campaign(this.db, thread.campaignId);
    const chain = await this.publication.chainCampaign(thread.campaignId);
    const [entitlement] = await this.db.select({ id: campaignEntitlements.id, backerUserId: campaignEntitlements.backerUserId,
      backerWallet: campaignEntitlements.backerWallet, amountPaid: campaignEntitlements.amountPaid, canonical: campaignEntitlements.canonical,
      refunded: campaignEntitlements.refunded, streamId: campaignEntitlements.streamId, transactionHash: campaignEntitlements.transactionHash,
      blockNumber: campaignEntitlements.blockNumber }).from(campaignEntitlements).where(eq(campaignEntitlements.id, thread.entitlementId));
    const feedback = await this.db.select().from(campaignFeedback).where(and(eq(campaignFeedback.campaignId, thread.campaignId), eq(campaignFeedback.targetHash, thread.targetHash)));
    return {
      id: escalation.id,
      status: escalation.status,
      escalation,
      thread: await this.detail(this.db, thread.id),
      campaign: { id: campaign.id, title: campaign.title, pitch: campaign.pitch, commitmentHash: campaign.commitmentHash, frozenSnapshot: campaign.frozenSnapshot },
      chain: { status: chain.status, onchainCampaignId: chain.onchainCampaignId, snapshot: chain.snapshot, challenges: chain.challenges },
      entitlement: entitlement ?? null,
      feedback,
    };
  }

  async listResolverCases(userId: string) {
    if (!(await this.resolver(this.db, userId))) throw new ForbiddenException("RESOLVER platform role required");
    const cases = await this.db.select({ id: reviewEscalations.id }).from(reviewEscalations).orderBy(desc(reviewEscalations.createdAt));
    return Promise.all(cases.map(item => this.escalationCase(item.id)));
  }

  async resolverCase(escalationId: string, userId: string) {
    if (!(await this.resolver(this.db, userId))) throw new ForbiddenException("RESOLVER platform role required");
    return this.escalationCase(escalationId);
  }

  async requestCreatorResponse(escalationId: string, userId: string, body: unknown) {
    const input = parse(reviewMessageSchema, body);
    if (!(await this.resolver(this.db, userId))) throw new ForbiddenException("RESOLVER platform role required");
    let messageId: string;
    await this.db.transaction(async tx => {
      const [escalation] = await tx.select().from(reviewEscalations).where(eq(reviewEscalations.id, escalationId));
      if (!escalation) throw new NotFoundException("Resolver case not found");
      if (["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"].includes(escalation.status)) throw new ConflictException("This Resolver case is already closed");
      const [thread] = await tx.select().from(reviewThreads).where(eq(reviewThreads.id, escalation.threadId));
      if (!thread) throw new NotFoundException("Review thread not found");
      await this.assertActiveThreadEntitlement(tx, thread);
      const responseMessageId = await this.appendMessage(tx, escalation.threadId, userId, "RESOLVER", input.body);
      await tx.update(reviewEscalations).set({ status: "AWAITING_CREATOR_RESPONSE", updatedAt: new Date() }).where(eq(reviewEscalations.id, escalationId));
      await tx.update(reviewThreads).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(reviewThreads.id, escalation.threadId));
      messageId = responseMessageId;
    });
    const [message] = await this.db.select().from(reviewMessages).where(eq(reviewMessages.id, messageId!));
    return message;
  }

  async resolveEscalation(escalationId: string, userId: string, body: unknown) {
    const input = parse(campaignReviewEscalationOutcomeSchema, body);
    if (!(await this.resolver(this.db, userId))) throw new ForbiddenException("RESOLVER platform role required");
    let resolved: typeof reviewEscalations.$inferSelect;
    await this.db.transaction(async tx => {
      const [escalation] = await tx.select().from(reviewEscalations).where(eq(reviewEscalations.id, escalationId)).for("update");
      if (!escalation) throw new NotFoundException("Resolver case not found");
      if (["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"].includes(escalation.status)) { resolved = escalation; return; }
      const [updated] = await tx.update(reviewEscalations).set({ status: input.outcome, resolverUserId: userId, outcome: input.outcome,
        note: input.note, updatedAt: new Date(), resolvedAt: new Date() }).where(eq(reviewEscalations.id, escalationId)).returning();
      await tx.update(reviewThreads).set({ status: "RESOLVED", updatedAt: new Date() }).where(eq(reviewThreads.id, escalation.threadId));
      resolved = updated;
    });
    return resolved!;
  }
}
