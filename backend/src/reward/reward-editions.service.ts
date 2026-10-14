import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { rewardCampaigns as campaigns, rewardEditionsSamples as samples, rewardCreatorProfiles as profiles, rewardReviews as reviews, walletLinks, platformRoles, editionsFeedback } from "../database/schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { EvidenceUploadFile, validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import { editionsPreparationSchema, editionsReviewSchema, editionsRevisionSchema, editionsUpdateSchema } from "./reward-editions.schema";
import { createRewardCampaignDraftSchema } from "./reward-campaign.schema";
import { editionsCommitment, EditionsSnapshot } from "./reward-editions-commitment";

type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
type Campaign = typeof campaigns.$inferSelect;
type Sample = typeof samples.$inferSelect;
const sha256 = (bytes: Uint8Array) => `0x${createHash("sha256").update(bytes).digest("hex")}`;
const sampleDto = (sample: Sample) => ({ id: sample.id, sha256: sample.sha256, mediaType: sample.mediaType, sizeBytes: sample.sizeBytes });
export const EDITIONS_REVIEW_SLA_MS = 24 * 60 * 60 * 1000;

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ message: "Invalid Editions review payload", issues: result.error.issues });
  return result.data;
}

@Injectable()
export class RewardEditionsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService) {}

  private async campaign(db: NodePgDatabase<typeof schema> | Transaction, id: string, lock = false) {
    const query = db.select().from(campaigns).where(eq(campaigns.id, id));
    const [campaign] = await (lock ? query.for("update") : query);
    if (!campaign) throw new NotFoundException("Editions campaign not found");
    if (campaign.category !== "COMICS_ARTBOOK" || !campaign.draftConfig) throw new ConflictException("A valid Editions draft is required");
    return campaign;
  }

  private owner(campaign: Campaign, userId: string) {
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only the creator can change this campaign");
  }

  private editable(campaign: Campaign, revision?: number) {
    if (campaign.status !== "DRAFT" || campaign.frozenAt || campaign.frozenSnapshot) throw new ConflictException("Frozen terms cannot be changed");
    if (revision !== undefined && campaign.revision !== revision) throw new ConflictException("Draft changed; reload before continuing");
  }

  private async resolver(db: NodePgDatabase<typeof schema> | Transaction, userId: string) {
    const [role] = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("RESOLVER platform role required");
  }

  async linkedWallets(userId: string) {
    return this.db.select({ id: walletLinks.id, chainId: walletLinks.chainId, address: walletLinks.address })
      .from(walletLinks).where(and(eq(walletLinks.userId, userId), eq(walletLinks.chainId, "31339")));
  }

  private async references(tx: Transaction, campaign: Campaign, preparation: z.output<typeof editionsPreparationSchema>) {
    const [wallet] = await tx.select().from(walletLinks).where(and(eq(walletLinks.id, preparation.payoutWalletLinkId),
      eq(walletLinks.userId, campaign.creatorUserId), eq(walletLinks.chainId, "31339"))).for("share");
    if (!wallet) throw new BadRequestException("Choose your verified linked wallet on local chain 31339");
    const evidence = await tx.select().from(samples).where(and(eq(samples.campaignId, campaign.id),
      eq(samples.ownerUserId, campaign.creatorUserId), eq(samples.purpose, "SAMPLE_PAGE"), inArray(samples.id, preparation.sampleIds)));
    if (evidence.length !== preparation.sampleIds.length) throw new BadRequestException("Samples must belong to this creator and campaign");
    return { wallet, evidence: evidence.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  }

  async update(id: string, userId: string, body: unknown) {
    const input = parse(editionsUpdateSchema, body);
    return this.db.transaction(async tx => {
      const campaign = await this.campaign(tx, id, true);
      this.owner(campaign, userId);
      this.editable(campaign, input.revision);
      await this.references(tx, campaign, input.preparation);
      const { config } = input;
      const [updated] = await tx.update(campaigns).set({ draftConfig: config, reviewPreparation: input.preparation,
        title: config.title, pitch: config.pitch, story: config.story, goal: config.goal, fundingDuration: config.fundingDuration,
        revision: campaign.revision + 1, updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async uploadSample(id: string, userId: string, file?: EvidenceUploadFile) {
    // Check ACL before inspecting or storing user-controlled bytes.
    const campaign = await this.campaign(this.db, id);
    this.owner(campaign, userId);
    this.editable(campaign);
    const mediaType = await validateEvidenceFile(file);
    const objectId = randomUUID();
    await this.storage.verifyPrivateBucket();
    await this.storage.put(objectId, file!.buffer, mediaType);
    try {
      return await this.db.transaction(async tx => {
        const current = await this.campaign(tx, id, true);
        this.owner(current, userId);
        this.editable(current);
        const existing = await tx.select({ id: samples.id }).from(samples).where(eq(samples.campaignId, id));
        if (existing.length >= 20) throw new ConflictException("At most 20 sample files per campaign");
        const [sample] = await tx.insert(samples).values({ campaignId: id, ownerUserId: userId, objectId,
          sha256: sha256(file!.buffer), mediaType, sizeBytes: file!.buffer.length }).returning();
        return sampleDto(sample);
      });
    } catch (error) {
      await this.storage.remove(objectId);
      throw error;
    }
  }

  private async readBytes(sample: Sample) {
    try {
      const object = await this.storage.get(sample.objectId);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== sample.sizeBytes || sha256(bytes) !== sample.sha256) throw new Error("Evidence integrity mismatch");
      return Buffer.from(bytes);
    } catch {
      throw new ServiceUnavailableException("Sample file unavailable or integrity check failed");
    }
  }

  private async canReadSamples(campaign: Campaign, userId: string) {
    if (campaign.creatorUserId === userId) return;
    await this.resolver(this.db, userId);
    if (!["UNDER_REVIEW", "APPROVED", "STOPPED"].includes(campaign.status) || !campaign.frozenSnapshot)
      throw new ForbiddenException("Samples have not been submitted for review");
  }

  async listSamples(id: string, userId: string) {
    const campaign = await this.campaign(this.db, id);
    await this.canReadSamples(campaign, userId);
    const items = await this.db.select().from(samples).where(eq(samples.campaignId, id));
    const permitted = campaign.creatorUserId === userId ? items : items.filter(item => campaign.frozenSnapshot!.samples.some(ref => ref.id === item.id));
    return permitted.map(sampleDto);
  }

  async readSample(id: string, sampleId: string, userId: string) {
    const campaign = await this.campaign(this.db, id);
    await this.canReadSamples(campaign, userId);
    if (campaign.creatorUserId !== userId && !campaign.frozenSnapshot!.samples.some(ref => ref.id === sampleId))
      throw new NotFoundException("Sample not in reviewed snapshot");
    const [sample] = await this.db.select().from(samples).where(and(eq(samples.id, sampleId), eq(samples.campaignId, id)));
    if (!sample) throw new NotFoundException("Sample not found");
    return { bytes: await this.readBytes(sample), mediaType: sample.mediaType };
  }

  async freeze(id: string, userId: string, body: unknown) {
    const { revision } = parse(editionsRevisionSchema, body);
    return this.db.transaction(async tx => {
      const campaign = await this.campaign(tx, id, true);
      this.owner(campaign, userId);
      this.editable(campaign, revision);
      if (!campaign.reviewPreparation) throw new ConflictException("Complete review preparation before freezing");
      const config = parse(createRewardCampaignDraftSchema, campaign.draftConfig);
      const preparation = parse(editionsPreparationSchema, campaign.reviewPreparation);
      const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).for("share");
      if (profile?.status !== "VERIFIED") throw new ForbiddenException("Creator verification is required");
      const { wallet, evidence } = await this.references(tx, campaign, preparation);
      await this.storage.verifyPrivateBucket();
      for (const sample of evidence) await this.readBytes(sample);
      const { payoutWalletLinkId: _, sampleIds: __, ...terms } = preparation;
      const snapshot: EditionsSnapshot = { commitmentVersion: "editions-review-v1", config,
        creator: { userId, profileId: profile.id, displayName: profile.displayName, ipDeclaration: profile.ipDeclaration },
        payoutWallet: { linkId: wallet.id, chainId: wallet.chainId, address: wallet.address.toLowerCase() },
        preparation: terms, samples: evidence.map(sampleDto) };
      const [updated] = await tx.update(campaigns).set({ frozenSnapshot: snapshot, commitmentHash: editionsCommitment(snapshot),
        payoutWalletLinkId: wallet.id, frozenAt: new Date(), status: "FROZEN", revision: revision + 1, updatedAt: new Date() })
        .where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async submit(id: string, userId: string, body: unknown) {
    const { revision } = parse(editionsRevisionSchema, body);
    return this.db.transaction(async tx => {
      const campaign = await this.campaign(tx, id, true);
      this.owner(campaign, userId);
      if (campaign.status !== "FROZEN" || campaign.revision !== revision || !campaign.frozenSnapshot ||
        editionsCommitment(campaign.frozenSnapshot) !== campaign.commitmentHash) throw new ConflictException("A current frozen commitment is required");
      const reviewStartedAt = new Date();
      const reviewDeadlineAt = new Date(reviewStartedAt.getTime() + EDITIONS_REVIEW_SLA_MS);
      const [updated] = await tx.update(campaigns).set({ status: "UNDER_REVIEW", reviewStartedAt, reviewDeadlineAt,
        revision: revision + 1, updatedAt: reviewStartedAt })
        .where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async review(id: string, userId: string, body: unknown) {
    const input = parse(editionsReviewSchema, body);
    return this.db.transaction(async tx => {
      await this.resolver(tx, userId);
      const campaign = await this.campaign(tx, id, true);
      if (campaign.creatorUserId === userId) throw new ForbiddenException("Creator cannot review their own campaign");
      if (campaign.status !== "UNDER_REVIEW" || !campaign.frozenSnapshot || !campaign.commitmentHash ||
        campaign.commitmentHash !== input.commitmentHash || editionsCommitment(campaign.frozenSnapshot) !== input.commitmentHash)
        throw new ConflictException("Review must target the current frozen commitment");
      await tx.insert(reviews).values({ campaignId: id, resolverUserId: userId, outcome: input.outcome,
        decisionReason: input.decisionReason, commitmentHash: input.commitmentHash, frozenSnapshot: campaign.frozenSnapshot });
      const correction = input.outcome === "CHANGES_REQUESTED";
      const [updated] = await tx.update(campaigns).set({
        status: correction ? "DRAFT" : input.outcome === "REJECTED" ? "STOPPED" : "APPROVED",
        ...(correction ? { frozenAt: null, frozenSnapshot: null, commitmentHash: null } : {}),
        ...(input.outcome !== "APPROVED" ? { payoutWalletLinkId: null } : {}),
        ...(correction ? { reviewStartedAt: null, reviewDeadlineAt: null } : {}),
        revision: campaign.revision + 1, updatedAt: new Date(),
      }).where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async publicList() {
    const items = await this.db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.category, "COMICS_ARTBOOK"),
      inArray(campaigns.status, ["UNDER_REVIEW", "APPROVED"])));
    return Promise.all(items.map(item => this.publicPreview(item.id)));
  }

  async publicPreview(id: string) {
    const campaign = await this.campaign(this.db, id);
    if (!["UNDER_REVIEW", "APPROVED"].includes(campaign.status) || !campaign.frozenSnapshot || !campaign.commitmentHash ||
      editionsCommitment(campaign.frozenSnapshot) !== campaign.commitmentHash)
      throw new NotFoundException("Approved preview not found");
    const { config, creator, preparation, samples: evidence } = campaign.frozenSnapshot;
    const [reports] = await this.db.select({ count: count() }).from(editionsFeedback).where(eq(editionsFeedback.campaignId, id));
    const decisions = await this.db.select({ outcome: reviews.outcome, commitmentHash: reviews.commitmentHash, reviewedAt: reviews.reviewedAt })
      .from(reviews).where(eq(reviews.campaignId, id)).orderBy(desc(reviews.reviewedAt));
    return { id, status: campaign.status, publicationEnabled: false, commitmentHash: campaign.commitmentHash,
      config, creatorDisplayName: creator.displayName, contentOutline: preparation.contentOutline,
      budgetPlan: preparation.budgetPlan, evidencePlan: preparation.evidencePlan, feedbackCount: reports.count, decisions,
      releaseWindow: preparation.releaseWindow, evidenceHashes: evidence.map(item => item.sha256) };
  }
}
