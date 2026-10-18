import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { DRIZZLE_DB } from "../../../database/database.constants";
import * as schema from "../../../database/schema";
import { campaigns as campaigns, campaignSamples as samples, creatorProfiles as profiles, campaignReviews as reviews, walletLinks, platformRoles, campaignFeedback, creatorResponses as creatorResponses, creatorResponseFeedback as responseFeedback } from "../../../database/schema";
import { EvidenceStorageService } from "../../evidence/evidence-storage.service";
import { EvidenceUploadFile, validateEvidenceFile } from "../../evidence/evidence-file-validation";
import { currentReviewTargets } from "../../delivery/policies/delivery.policy";
import { campaignPreparationSchema, campaignReviewSchema, campaignRevisionSchema, campaignSubmitReviewSchema, campaignUpdateSchema } from "../schemas/preparation.schema";
import { createCampaignDraftSchema } from "../schemas/campaign.schema";
import { campaignCommitment, CampaignSnapshot } from "../policies/commitment";
import { CampaignIndexerService } from "../../../indexer/campaign-indexer.service";

type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
type Campaign = typeof campaigns.$inferSelect;
type Sample = typeof samples.$inferSelect;
const sha256 = (bytes: Uint8Array) => `0x${createHash("sha256").update(bytes).digest("hex")}`;
const sampleDto = (sample: Sample) => ({ id: sample.id, sha256: sample.sha256, mediaType: sample.mediaType, sizeBytes: sample.sizeBytes });
export type CampaignPublicStatus = "COMMUNITY_REVIEW" | "APPROVED" | "PUBLISHED";

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ message: "Invalid Campaign review payload", issues: result.error.issues });
  return result.data;
}

@Injectable()
export class CampaignService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService,
    @Optional() private readonly indexer?: CampaignIndexerService) {}

  private async campaign(db: NodePgDatabase<typeof schema> | Transaction, id: string, lock = false) {
    const query = db.select().from(campaigns).where(eq(campaigns.id, id));
    const [campaign] = await (lock ? query.for("update") : query);
    if (!campaign) throw new NotFoundException("Campaign campaign not found");
    if (campaign.category !== "COMICS_ARTBOOK" || !campaign.draftConfig) throw new ConflictException("A valid Campaign draft is required");
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
    const wallets = await this.db.select({ id: walletLinks.id, chainId: walletLinks.chainId, address: walletLinks.address })
      .from(walletLinks).where(and(eq(walletLinks.userId, userId), eq(walletLinks.chainId, "31339")));
    const [profile] = await this.db.select({ studioWalletLinkId: profiles.studioWalletLinkId })
      .from(profiles).where(eq(profiles.userId, userId));
    const deployment = this.indexer ? await this.indexer.deployment() : null;
    const resolverWallets = new Set(deployment
      ? [deployment.resolver, deployment.backupResolver].map(address => address.toLowerCase())
      : []);
    return wallets
      .filter(wallet => !resolverWallets.has(wallet.address.toLowerCase()))
      .map(wallet => ({ ...wallet, isStudioWallet: wallet.id === profile?.studioWalletLinkId }));
  }

  async transactionWallets(userId: string) {
    return this.db.select({ id: walletLinks.id, chainId: walletLinks.chainId, address: walletLinks.address })
      .from(walletLinks).where(and(eq(walletLinks.userId, userId), eq(walletLinks.chainId, "31339")));
  }

  private async references(tx: Transaction, campaign: Campaign, preparation: z.output<typeof campaignPreparationSchema>) {
    const [profile] = await tx.select({ studioWalletLinkId: profiles.studioWalletLinkId })
      .from(profiles).where(eq(profiles.userId, campaign.creatorUserId));
    if (!profile?.studioWalletLinkId || profile.studioWalletLinkId !== preparation.payoutWalletLinkId) {
      throw new BadRequestException("Campaign must use the Creator's verified Studio wallet");
    }
    const [wallet] = await tx.select().from(walletLinks).where(and(eq(walletLinks.id, preparation.payoutWalletLinkId),
      eq(walletLinks.userId, campaign.creatorUserId), eq(walletLinks.chainId, "31339"))).for("share");
    if (!wallet) throw new BadRequestException("Choose your verified linked wallet on local chain 31339");
    if (this.indexer) {
      const deployment = await this.indexer.deployment();
      const resolverWallets = new Set([deployment.resolver, deployment.backupResolver].map(address => address.toLowerCase()));
      if (resolverWallets.has(wallet.address.toLowerCase())) {
        throw new BadRequestException("Creator payout wallet cannot be a Resolver wallet in the current Campaign deployment");
      }
    }
    const evidence = await tx.select().from(samples).where(and(eq(samples.campaignId, campaign.id),
      eq(samples.ownerUserId, campaign.creatorUserId), eq(samples.purpose, "SAMPLE_PAGE"), inArray(samples.id, preparation.sampleIds)));
    if (evidence.length !== preparation.sampleIds.length) throw new BadRequestException("Samples must belong to this creator and campaign");
    return { wallet, evidence: evidence.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  }

  async update(id: string, userId: string, body: unknown) {
    const input = parse(campaignUpdateSchema, body);
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
    if (!["UNDER_REVIEW_PRIVATE", "COMMUNITY_REVIEW", "APPROVED", "STOPPED"].includes(campaign.status) || !campaign.frozenSnapshot)
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
    const { revision } = parse(campaignRevisionSchema, body);
    return this.db.transaction(async tx => {
      const campaign = await this.campaign(tx, id, true);
      this.owner(campaign, userId);
      this.editable(campaign, revision);
      if (!campaign.reviewPreparation) throw new ConflictException("Complete review preparation before freezing");
      const config = parse(createCampaignDraftSchema, campaign.draftConfig);
      const preparation = parse(campaignPreparationSchema, campaign.reviewPreparation);
      const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).for("share");
      if (profile?.status !== "VERIFIED" || profile.originalWorkPledge !== true) {
        throw new ForbiddenException("Creator verification and explicit original-work pledge are required");
      }
      const { wallet, evidence } = await this.references(tx, campaign, preparation);
      await this.storage.verifyPrivateBucket();
      for (const sample of evidence) await this.readBytes(sample);
      const { payoutWalletLinkId: _, sampleIds: __, ...terms } = preparation;
      const snapshot: CampaignSnapshot = { commitmentVersion: "campaigns-review-v1", config,
        creator: { userId, profileId: profile.id, displayName: profile.displayName, ipDeclaration: profile.ipDeclaration },
        payoutWallet: { linkId: wallet.id, chainId: wallet.chainId, address: wallet.address.toLowerCase() },
        preparation: terms, samples: evidence.map(sampleDto) };
      const [updated] = await tx.update(campaigns).set({ frozenSnapshot: snapshot, commitmentHash: campaignCommitment(snapshot),
        payoutWalletLinkId: wallet.id, frozenAt: new Date(), status: "FROZEN", revision: revision + 1, updatedAt: new Date() })
        .where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async submit(id: string, userId: string, body: unknown) {
    const input = parse(campaignSubmitReviewSchema, body);
    return this.db.transaction(async tx => {
      const campaign = await this.campaign(tx, id, true);
      this.owner(campaign, userId);
      if (campaign.status !== "FROZEN" || campaign.revision !== input.revision || !campaign.frozenSnapshot ||
        campaignCommitment(campaign.frozenSnapshot) !== campaign.commitmentHash) throw new ConflictException("A current frozen commitment is required");
      const [priorFeedback] = await tx.select({ id: campaignFeedback.id }).from(campaignFeedback)
        .where(eq(campaignFeedback.campaignId, id)).limit(1);
      const [priorCorrection] = await tx.select({ id: reviews.id }).from(reviews)
        .where(and(eq(reviews.campaignId, id), eq(reviews.outcome, "CHANGES_REQUESTED"))).limit(1);
      if ((priorFeedback || priorCorrection) && !input.responseBody)
        throw new BadRequestException("A Creator response is required when resubmitting after review feedback");
      if (input.relatedFeedbackIds.length) {
        const linked = await tx.select({ id: campaignFeedback.id }).from(campaignFeedback)
          .where(and(eq(campaignFeedback.campaignId, id), inArray(campaignFeedback.id, input.relatedFeedbackIds)));
        if (linked.length !== input.relatedFeedbackIds.length) throw new BadRequestException("Feedback references must belong to this campaign");
      }
      const reviewStartedAt = new Date();
      const [updated] = await tx.update(campaigns).set({ status: "UNDER_REVIEW_PRIVATE", reviewStartedAt,
        revision: input.revision + 1, updatedAt: reviewStartedAt })
        .where(eq(campaigns.id, id)).returning();
      if (input.responseBody) {
        const [response] = await tx.insert(creatorResponses).values({ campaignId: id, creatorUserId: userId,
          submissionRevision: input.revision, commitmentHash: campaign.commitmentHash!, responseBody: input.responseBody }).returning({ id: creatorResponses.id });
        if (input.relatedFeedbackIds.length) await tx.insert(responseFeedback).values(input.relatedFeedbackIds.map(feedbackId => ({ responseId: response.id, feedbackId })));
      }
      return updated;
    });
  }

  async openCommunityReview(id: string, userId: string) {
    return this.db.transaction(async tx => {
      await this.resolver(tx, userId);
      const campaign = await this.campaign(tx, id, true);
      if (campaign.creatorUserId === userId) throw new ForbiddenException("Creator cannot open their own campaign review");
      if (campaign.status !== "UNDER_REVIEW_PRIVATE" || !campaign.frozenSnapshot || !campaign.commitmentHash ||
        campaignCommitment(campaign.frozenSnapshot) !== campaign.commitmentHash)
        throw new ConflictException("A current private frozen commitment is required");
      const [updated] = await tx.update(campaigns).set({ status: "COMMUNITY_REVIEW", updatedAt: new Date() })
        .where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async review(id: string, userId: string, body: unknown) {
    const input = parse(campaignReviewSchema, body);
    return this.db.transaction(async tx => {
      await this.resolver(tx, userId);
      const campaign = await this.campaign(tx, id, true);
      if (campaign.creatorUserId === userId) throw new ForbiddenException("Creator cannot review their own campaign");
      if (campaign.status !== "COMMUNITY_REVIEW" || !campaign.frozenSnapshot || !campaign.commitmentHash ||
        campaign.commitmentHash !== input.commitmentHash || campaignCommitment(campaign.frozenSnapshot) !== input.commitmentHash)
        throw new ConflictException("Review must target the current frozen commitment");
      await tx.insert(reviews).values({ campaignId: id, resolverUserId: userId, outcome: input.outcome,
        decisionReason: input.decisionReason, commitmentHash: input.commitmentHash, frozenSnapshot: campaign.frozenSnapshot });
      const correction = input.outcome === "CHANGES_REQUESTED";
      const [updated] = await tx.update(campaigns).set({
        status: correction ? "DRAFT" : input.outcome === "REJECTED" ? "STOPPED" : "APPROVED",
        ...(correction ? { frozenAt: null, frozenSnapshot: null, commitmentHash: null } : {}),
        ...(input.outcome !== "APPROVED" ? { payoutWalletLinkId: null } : {}),
        ...(correction ? { reviewStartedAt: null } : {}),
        revision: campaign.revision + 1, updatedAt: new Date(),
      }).where(eq(campaigns.id, id)).returning();
      return updated;
    });
  }

  async publicList(status: CampaignPublicStatus | readonly CampaignPublicStatus[]) {
    const statuses = Array.isArray(status) ? status : [status];
    const items = await this.db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.category, "COMICS_ARTBOOK"),
      inArray(campaigns.status, statuses)));
    return Promise.all(items.map(item => this.publicPreview(item.id)));
  }

  async publicPreview(id: string) {
    const campaign = await this.campaign(this.db, id);
    if (!["COMMUNITY_REVIEW", "APPROVED", "PUBLISHED"].includes(campaign.status) || !campaign.frozenSnapshot || !campaign.commitmentHash ||
      campaignCommitment(campaign.frozenSnapshot) !== campaign.commitmentHash)
      throw new NotFoundException("Approved preview not found");
    const { config, creator, preparation, samples: evidence } = campaign.frozenSnapshot;
    const activeTargets = currentReviewTargets({ commitmentHash: campaign.commitmentHash, frozenSnapshot: { samples: evidence } });
    const feedbackRows = await this.db.select({ targetHash: campaignFeedback.targetHash, kind: campaignFeedback.kind }).from(campaignFeedback)
      .where(eq(campaignFeedback.campaignId, id));
    const decisions = await this.db.select({ outcome: reviews.outcome, commitmentHash: reviews.commitmentHash, reviewedAt: reviews.reviewedAt })
      .from(reviews).where(eq(reviews.campaignId, id)).orderBy(desc(reviews.reviewedAt));
    return { id, status: campaign.status, publicationEnabled: false, commitmentHash: campaign.commitmentHash,
      reviewStartedAt: campaign.reviewStartedAt?.toISOString() ?? null,
      config, creatorDisplayName: creator.displayName, contentOutline: preparation.contentOutline,
      budgetPlan: preparation.budgetPlan, evidencePlan: preparation.evidencePlan,
      feedbackCount: feedbackRows.filter(item => item.kind === "COMMENT" && activeTargets.has(item.targetHash)).length, decisions,
      evidenceHashes: evidence.map(item => item.sha256) };
  }
}
