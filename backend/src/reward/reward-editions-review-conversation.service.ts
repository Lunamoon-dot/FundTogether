import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as schema from "../database/schema";
import { editionsEntitlements, editionsFeedback, editionsReviewEscalations, editionsReviewMessages, editionsReviewThreads, platformRoles, rewardCampaigns } from "../database/schema";
import { DRIZZLE_DB } from "../database/database.constants";
import { currentEditionsFeedbackTargets } from "./reward-editions-delivery.policy";
import { canOpenEditionsReviewThread } from "./reward-editions-review-conversation.policy";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";
import { editionsReviewEscalationOutcomeSchema, editionsReviewEscalationSchema, editionsReviewMessageSchema, editionsReviewMessageSchema as reviewMessageSchema, editionsReviewThreadOpenSchema } from "./reward-editions.schema";

type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
const zeroHash = `0x${"0".repeat(64)}`;

function parse<T extends z.ZodType>(schemaType: T, body: unknown): z.output<T> {
  const result = schemaType.safeParse(body);
  if (!result.success) throw new BadRequestException("A bounded review message, reason or current target is required");
  return result.data;
}

@Injectable()
export class RewardEditionsReviewConversationService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly indexer: RewardEditionsIndexerService,
    private readonly publication: RewardEditionsPublicationService,
  ) {}

  private async campaign(db: NodePgDatabase<typeof schema> | Transaction, campaignId: string) {
    const [campaign] = await db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, campaignId));
    if (!campaign?.draftConfig || campaign.category !== "COMICS_ARTBOOK") throw new NotFoundException("Editions campaign not found");
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
    const [entitlement] = await this.db.select().from(editionsEntitlements).where(and(
      eq(editionsEntitlements.campaignId, campaignId),
      eq(editionsEntitlements.streamId, this.indexer.streamId()),
      eq(editionsEntitlements.backerUserId, userId),
      eq(editionsEntitlements.canonical, true),
      eq(editionsEntitlements.refunded, false),
    ));
    const allowed = canOpenEditionsReviewThread({
      userId,
      creatorUserId: campaign.creatorUserId,
      publicationStatus: chain.status,
      chainState: chain.snapshot?.state ?? null,
      entitlement: entitlement ? { backerUserId: entitlement.backerUserId, canonical: entitlement.canonical, refunded: entitlement.refunded } : null,
    });
    if (!allowed || !entitlement || !chain.snapshot || !campaign.frozenSnapshot || !campaign.commitmentHash)
      throw new ConflictException("A canonical funded Editions entitlement is required for review");
    return { campaign, chain, entitlement };
  }

  private async detail(db: NodePgDatabase<typeof schema> | Transaction, threadId: string) {
    const [thread] = await db.select().from(editionsReviewThreads).where(eq(editionsReviewThreads.id, threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const messages = await db.select().from(editionsReviewMessages).where(eq(editionsReviewMessages.threadId, threadId))
      .orderBy(asc(editionsReviewMessages.createdAt), asc(editionsReviewMessages.id));
    const [escalation] = await db.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.threadId, threadId));
    return { ...thread, messages, escalation: escalation ?? null };
  }

  private async authorizedThread(db: NodePgDatabase<typeof schema> | Transaction, threadId: string, userId: string) {
    const [thread] = await db.select().from(editionsReviewThreads).where(eq(editionsReviewThreads.id, threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const participant = thread.backerUserId === userId || thread.creatorUserId === userId;
    if (!participant && !(await this.resolver(db, userId))) throw new ForbiddenException("Review thread participant or Resolver required");
    return { thread, participant };
  }

  async openThread(campaignId: string, userId: string, body: unknown) {
    const input = parse(editionsReviewThreadOpenSchema, body);
    const { campaign, chain, entitlement } = await this.canonicalBacker(campaignId, userId);
    const targets = currentEditionsFeedbackTargets({
      commitmentHash: campaign.commitmentHash,
      frozenSnapshot: campaign.frozenSnapshot,
      chain: { snapshot: chain.snapshot, challenges: chain.challenges },
      zeroHash,
    });
    if (!targets.has(input.targetHash)) throw new ConflictException("Review thread must identify a current campaign or evidence target");

    let threadId: string;
    await this.db.transaction(async tx => {
      const [existing] = await tx.select({ id: editionsReviewThreads.id }).from(editionsReviewThreads).where(and(
        eq(editionsReviewThreads.campaignId, campaignId), eq(editionsReviewThreads.entitlementId, entitlement.id), eq(editionsReviewThreads.targetHash, input.targetHash),
      ));
      if (existing) { threadId = existing.id; return; }
      const [thread] = await tx.insert(editionsReviewThreads).values({ campaignId, entitlementId: entitlement.id,
        backerUserId: userId, creatorUserId: campaign.creatorUserId, targetHash: input.targetHash, commitmentHash: campaign.commitmentHash!, status: "OPEN" }).returning({ id: editionsReviewThreads.id });
      await tx.insert(editionsReviewMessages).values({ threadId: thread.id, authorUserId: userId, authorRole: "BACKER", body: input.body });
      threadId = thread.id;
    });
    return this.detail(this.db, threadId!);
  }

  async thread(threadId: string, userId: string) {
    await this.authorizedThread(this.db, threadId, userId);
    return this.detail(this.db, threadId);
  }

  async message(threadId: string, userId: string, body: unknown) {
    const input = parse(editionsReviewMessageSchema, body);
    let messageId: string;
    await this.db.transaction(async tx => {
      const { thread } = await this.authorizedThread(tx, threadId, userId);
      if (thread.status === "CLOSED") throw new ConflictException("Closed review threads cannot receive messages");
      const authorRole = thread.backerUserId === userId ? "BACKER" : thread.creatorUserId === userId ? "CREATOR" : null;
      if (!authorRole) throw new ForbiddenException("Only the Backer and Creator can message this thread");
      const [message] = await tx.insert(editionsReviewMessages).values({ threadId, authorUserId: userId, authorRole, body: input.body }).returning({ id: editionsReviewMessages.id });
      await tx.update(editionsReviewThreads).set({ updatedAt: new Date() }).where(eq(editionsReviewThreads.id, threadId));
      messageId = message.id;
    });
    const [message] = await this.db.select().from(editionsReviewMessages).where(eq(editionsReviewMessages.id, messageId!));
    return message;
  }

  async escalate(threadId: string, userId: string, body: unknown) {
    const input = parse(editionsReviewEscalationSchema, body);
    let escalationId: string;
    await this.db.transaction(async tx => {
      const { thread } = await this.authorizedThread(tx, threadId, userId);
      if (thread.backerUserId !== userId) throw new ForbiddenException("Only the Backer can escalate a review thread");
      if (["RESOLVED", "CLOSED"].includes(thread.status)) throw new ConflictException("This review thread is already closed");
      const [existing] = await tx.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.threadId, threadId));
      if (existing) { escalationId = existing.id; return; }
      const [saved] = await tx.insert(editionsReviewEscalations).values({ threadId, openerUserId: userId, reason: input.reason, status: "OPEN" }).returning({ id: editionsReviewEscalations.id });
      await tx.update(editionsReviewThreads).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(editionsReviewThreads.id, threadId));
      escalationId = saved.id;
    });
    const [escalation] = await this.db.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.id, escalationId!));
    return escalation;
  }

  private async escalationCase(escalationId: string) {
    const [escalation] = await this.db.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.id, escalationId));
    if (!escalation) throw new NotFoundException("Resolver case not found");
    const [thread] = await this.db.select().from(editionsReviewThreads).where(eq(editionsReviewThreads.id, escalation.threadId));
    if (!thread) throw new NotFoundException("Review thread not found");
    const campaign = await this.campaign(this.db, thread.campaignId);
    const chain = await this.publication.chainCampaign(thread.campaignId);
    const [entitlement] = await this.db.select({ id: editionsEntitlements.id, backerUserId: editionsEntitlements.backerUserId,
      backerWallet: editionsEntitlements.backerWallet, amountPaid: editionsEntitlements.amountPaid, canonical: editionsEntitlements.canonical,
      refunded: editionsEntitlements.refunded, streamId: editionsEntitlements.streamId, transactionHash: editionsEntitlements.transactionHash,
      blockNumber: editionsEntitlements.blockNumber }).from(editionsEntitlements).where(eq(editionsEntitlements.id, thread.entitlementId));
    const feedback = await this.db.select().from(editionsFeedback).where(and(eq(editionsFeedback.campaignId, thread.campaignId), eq(editionsFeedback.targetHash, thread.targetHash)));
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
    const cases = await this.db.select({ id: editionsReviewEscalations.id }).from(editionsReviewEscalations).orderBy(desc(editionsReviewEscalations.createdAt));
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
      const [escalation] = await tx.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.id, escalationId));
      if (!escalation) throw new NotFoundException("Resolver case not found");
      if (["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"].includes(escalation.status)) throw new ConflictException("This Resolver case is already closed");
      const [message] = await tx.insert(editionsReviewMessages).values({ threadId: escalation.threadId, authorUserId: userId, authorRole: "RESOLVER", body: input.body }).returning({ id: editionsReviewMessages.id });
      await tx.update(editionsReviewEscalations).set({ status: "AWAITING_CREATOR_RESPONSE", updatedAt: new Date() }).where(eq(editionsReviewEscalations.id, escalationId));
      await tx.update(editionsReviewThreads).set({ status: "ESCALATED", updatedAt: new Date() }).where(eq(editionsReviewThreads.id, escalation.threadId));
      messageId = message.id;
    });
    const [message] = await this.db.select().from(editionsReviewMessages).where(eq(editionsReviewMessages.id, messageId!));
    return message;
  }

  async resolveEscalation(escalationId: string, userId: string, body: unknown) {
    const input = parse(editionsReviewEscalationOutcomeSchema, body);
    if (!(await this.resolver(this.db, userId))) throw new ForbiddenException("RESOLVER platform role required");
    let resolved: typeof editionsReviewEscalations.$inferSelect;
    await this.db.transaction(async tx => {
      const [escalation] = await tx.select().from(editionsReviewEscalations).where(eq(editionsReviewEscalations.id, escalationId)).for("update");
      if (!escalation) throw new NotFoundException("Resolver case not found");
      if (["RESOLVED", "DISMISSED", "FORMAL_DISPUTE"].includes(escalation.status)) { resolved = escalation; return; }
      const [updated] = await tx.update(editionsReviewEscalations).set({ status: input.outcome, resolverUserId: userId, outcome: input.outcome,
        note: input.note, updatedAt: new Date(), resolvedAt: new Date() }).where(eq(editionsReviewEscalations.id, escalationId)).returning();
      await tx.update(editionsReviewThreads).set({ status: "RESOLVED", updatedAt: new Date() }).where(eq(editionsReviewThreads.id, escalation.threadId));
      resolved = updated;
    });
    return resolved!;
  }
}
