import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomUUID } from "node:crypto";
import * as schema from "../../../database/schema";
import { DRIZZLE_DB } from "../../../database/database.constants";
import { CampaignIndexerService } from "../../../indexer/campaign-indexer.service";
import { PublicationService } from "../../campaigns/services/publication.service";
import { EvidenceUploadFile, MAX_EVIDENCE_FILES, MAX_EVIDENCE_FILE_BYTES, validateEvidenceFile } from "../../evidence/evidence-file-validation";
import { EvidenceStorageService } from "../../evidence/evidence-storage.service";
import { completionDecisionBodySchema, completionRequestBodySchema, CompletionDecisionBody, CompletionRequestBody } from "../schemas/completion.schema";

const RELEASED_STATE = 3;
const COMPLETION_REQUESTED_STATE = 5;
const pendingStatuses = ["DRAFT", "SUBMITTED_ON_CHAIN", "UNDER_REVIEW"] as const;
const hash = (value: string | Uint8Array) => `0x${createHash("sha256").update(value).digest("hex")}`;

type Upload = EvidenceUploadFile & { originalname: string };
type CompletionRequest = typeof schema.campaignCompletionRequests.$inferSelect;
type CompletionFile = typeof schema.campaignCompletionRequestFiles.$inferSelect;

function fileDto(file: CompletionFile, campaignId: string, requestId: string) {
  return {
    id: file.id,
    originalName: file.originalName,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    createdAt: file.createdAt,
    downloadPath: `/v1/fundtogether/campaigns/${campaignId}/completion-requests/${requestId}/files/${file.id}`,
  };
}

function decisionDto(decision: typeof schema.campaignCompletionDecisions.$inferSelect) {
  return {
    id: decision.id,
    outcome: decision.outcome,
    reason: decision.reason,
    decisionHash: decision.decisionHash,
    txHash: decision.txHash,
    resolverUserId: decision.resolverUserId,
    createdAt: decision.createdAt,
  };
}

function requestDto(request: CompletionRequest, files: CompletionFile[], decisions: (typeof schema.campaignCompletionDecisions.$inferSelect)[]) {
  return {
    id: request.id,
    campaignId: request.campaignId,
    streamId: request.streamId,
    commitmentHash: request.commitmentHash,
    revision: request.revision,
    requestHash: request.requestHash,
    title: request.title,
    summary: request.summary,
    reason: request.reason,
    status: request.status,
    requestTxHash: request.requestTxHash,
    requestedAt: request.requestedAt,
    decisionHash: request.decisionHash,
    decisionTxHash: request.decisionTxHash,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    files: files.map(file => fileDto(file, request.campaignId, request.id)),
    decisions: decisions.map(decisionDto),
  };
}

@Injectable()
export class CompletionService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly storage: EvidenceStorageService,
    private readonly indexer: CampaignIndexerService,
    private readonly publication: PublicationService,
  ) {}

  private async campaign(id: string) {
    const [campaign] = await this.db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    if (!campaign?.frozenSnapshot || campaign.category !== "COMICS_ARTBOOK" || !campaign.commitmentHash)
      throw new NotFoundException("Campaign not found");
    return campaign;
  }

  private async isResolver(userId: string) {
    const [role] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId));
    return role?.roles.includes("RESOLVER") === true;
  }

  private async hasCanonicalEntitlement(campaignId: string, userId: string) {
    const [entitlement] = await this.db.select({ id: schema.campaignEntitlements.id })
      .from(schema.campaignEntitlements)
      .where(and(
        eq(schema.campaignEntitlements.campaignId, campaignId),
        eq(schema.campaignEntitlements.streamId, this.indexer.streamId()),
        eq(schema.campaignEntitlements.backerUserId, userId),
        eq(schema.campaignEntitlements.canonical, true),
        eq(schema.campaignEntitlements.refunded, false),
      ));
    return Boolean(entitlement);
  }

  private async access(campaignId: string, userId: string) {
    const campaign = await this.campaign(campaignId);
    const reviewer = campaign.creatorUserId === userId || await this.isResolver(userId);
    if (reviewer) return { campaign, reviewer: true };
    if (!(await this.hasCanonicalEntitlement(campaignId, userId))) throw new ForbiddenException("Campaign Creator, Resolver or canonical Backer access required");
    return { campaign, reviewer: false };
  }

  private async canonicalChain(campaignId: string) {
    await this.indexer.runOnce();
    const chain = await this.publication.chainCampaign(campaignId);
    if (!chain.snapshot || chain.status !== "ON_CHAIN_CONFIRMED") throw new ConflictException("A canonical on-chain Campaign is required");
    return chain;
  }

  private async releasedChain(campaignId: string) {
    const chain = await this.canonicalChain(campaignId);
    const snapshot = chain.snapshot!;
    if (snapshot.state !== RELEASED_STATE) throw new ConflictException("Campaign must be RELEASED before requesting completion");
    if (BigInt(chain.chainTimestamp) < BigInt(snapshot.challengeDeadline)) throw new ConflictException("The completion challenge deadline has not passed");
    if (BigInt(snapshot.openDisputes) !== 0n) throw new ConflictException("Open disputes block completion");
    return { chain, snapshot };
  }

  private async requestChain(campaignId: string) {
    const chain = await this.canonicalChain(campaignId);
    if (chain.snapshot!.state !== COMPLETION_REQUESTED_STATE) throw new ConflictException("The completion request is not canonically submitted yet");
    if (BigInt(chain.snapshot!.openDisputes) !== 0n) throw new ConflictException("Open disputes block completion review");
    return chain;
  }

  private parseRequestBody(body: unknown): CompletionRequestBody {
    const parsed = completionRequestBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use title, summary and reason; amount and destination are not accepted");
    return parsed.data;
  }

  private parseDecisionBody(body: unknown): CompletionDecisionBody {
    const parsed = completionDecisionBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use APPROVE, CHANGES_REQUESTED or REJECT and a bounded reason");
    return parsed.data;
  }

  private async latestRequests(campaignId: string, streamId: string) {
    return this.db.select().from(schema.campaignCompletionRequests)
      .where(and(eq(schema.campaignCompletionRequests.campaignId, campaignId), eq(schema.campaignCompletionRequests.streamId, streamId)))
      .orderBy(desc(schema.campaignCompletionRequests.revision));
  }

  private requestHash(campaign: Awaited<ReturnType<CompletionService["campaign"]>>, streamId: string, revision: number, input: CompletionRequestBody, files: { sha256: string; mediaType: string; sizeBytes: number; originalName: string }[]) {
    return hash(JSON.stringify([
      "fundtogether-completion-request-v1",
      campaign.id,
      streamId,
      campaign.commitmentHash,
      revision,
      input,
      files.map(file => ({ sha256: file.sha256, mediaType: file.mediaType, sizeBytes: file.sizeBytes, originalName: file.originalName })),
    ]));
  }

  private decisionHash(request: CompletionRequest, input: CompletionDecisionBody) {
    return hash(JSON.stringify(["fundtogether-completion-decision-v1", request.id, request.requestHash, request.revision, input.outcome, input.reason]));
  }

  async create(campaignId: string, userId: string, body: unknown, files: Upload[] = []) {
    const campaign = await this.campaign(campaignId);
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only the Creator can submit a completion request");
    const input = this.parseRequestBody(body);
    if (files.length > MAX_EVIDENCE_FILES) throw new BadRequestException(`Attach at most ${MAX_EVIDENCE_FILES} supporting files`);
    if (files.some(file => file.buffer.length > MAX_EVIDENCE_FILE_BYTES)) throw new BadRequestException("Each supporting file must be at most 10 MiB");

    await this.releasedChain(campaignId);
    const streamId = this.indexer.streamId();
    const existing = await this.latestRequests(campaignId, streamId);
    if (existing.some(item => pendingStatuses.includes(item.status as typeof pendingStatuses[number]))) throw new ConflictException("A completion request is already pending for this campaign");
    const revision = (existing[0]?.revision ?? 0) + 1;
    const preparedFiles: { file: Upload; mediaType: string; sha256: string; objectId: string }[] = [];
    try {
      if (files.length) await this.storage.verifyPrivateBucket();
      for (const file of files) {
        const mediaType = await validateEvidenceFile(file);
        const objectId = randomUUID();
        const sha256 = hash(file.buffer);
        await this.storage.put(objectId, file.buffer, mediaType);
        preparedFiles.push({ file, mediaType, sha256, objectId });
      }
      const requestHash = this.requestHash(campaign, streamId, revision, input, preparedFiles.map(item => ({
        sha256: item.sha256, mediaType: item.mediaType, sizeBytes: item.file.buffer.length, originalName: item.file.originalname,
      })));
      const saved = await this.db.transaction(async tx => {
        await tx.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).for("update");
        const current = await tx.select().from(schema.campaignCompletionRequests)
          .where(and(eq(schema.campaignCompletionRequests.campaignId, campaignId), eq(schema.campaignCompletionRequests.streamId, streamId)))
          .orderBy(desc(schema.campaignCompletionRequests.revision));
        if (current.some(item => pendingStatuses.includes(item.status as typeof pendingStatuses[number]))) throw new ConflictException("A completion request is already pending for this campaign");
        const currentRevision = (current[0]?.revision ?? 0) + 1;
        if (currentRevision !== revision) throw new ConflictException("A completion request revision changed; reload and try again");
        const [request] = await tx.insert(schema.campaignCompletionRequests).values({
          campaignId, streamId, creatorUserId: userId, commitmentHash: campaign.commitmentHash!, revision, requestHash,
          title: input.title, summary: input.summary, reason: input.reason,
        }).returning();
        if (!request) throw new ConflictException("Could not create completion request");
        const fileRows = preparedFiles.length
          ? await tx.insert(schema.campaignCompletionRequestFiles).values(preparedFiles.map(item => ({
            requestId: request.id, objectId: item.objectId, originalName: item.file.originalname.slice(0, 255),
            sha256: item.sha256, mediaType: item.mediaType, sizeBytes: item.file.buffer.length,
          }))).returning()
          : [];
        return requestDto(request, fileRows, []);
      });
      return saved;
    } catch (error) {
      await Promise.all(preparedFiles.map(item => this.storage.remove(item.objectId).catch(() => undefined)));
      throw error;
    }
  }

  async list(campaignId: string, userId: string) {
    const { reviewer } = await this.access(campaignId, userId);
    const streamId = this.indexer.streamId();
    const requests = await this.db.select().from(schema.campaignCompletionRequests)
      .where(and(eq(schema.campaignCompletionRequests.campaignId, campaignId), eq(schema.campaignCompletionRequests.streamId, streamId)))
      .orderBy(desc(schema.campaignCompletionRequests.revision));
    const visible = reviewer ? requests : requests.filter(request => request.status !== "DRAFT");
    if (!visible.length) return [];
    const requestIds = visible.map(request => request.id);
    const [files, decisions] = await Promise.all([
      this.db.select().from(schema.campaignCompletionRequestFiles).where(inArray(schema.campaignCompletionRequestFiles.requestId, requestIds)),
      this.db.select().from(schema.campaignCompletionDecisions).where(inArray(schema.campaignCompletionDecisions.requestId, requestIds)).orderBy(desc(schema.campaignCompletionDecisions.createdAt)),
    ]);
    return visible.map(request => requestDto(request, files.filter(file => file.requestId === request.id), decisions.filter(decision => decision.requestId === request.id)));
  }

  async readFile(campaignId: string, requestId: string, fileId: string, userId: string) {
    await this.access(campaignId, userId);
    const [file] = await this.db.select({ file: schema.campaignCompletionRequestFiles, request: schema.campaignCompletionRequests })
      .from(schema.campaignCompletionRequestFiles)
      .innerJoin(schema.campaignCompletionRequests, eq(schema.campaignCompletionRequests.id, schema.campaignCompletionRequestFiles.requestId))
      .where(and(
        eq(schema.campaignCompletionRequestFiles.id, fileId),
        eq(schema.campaignCompletionRequestFiles.requestId, requestId),
        eq(schema.campaignCompletionRequests.campaignId, campaignId),
        eq(schema.campaignCompletionRequests.streamId, this.indexer.streamId()),
      ));
    if (!file || file.request.status === "DRAFT") throw new NotFoundException("Completion file not found");
    try {
      await this.storage.verifyPrivateBucket();
      const object = await this.storage.get(file.file.objectId);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== file.file.sizeBytes || hash(bytes) !== file.file.sha256) throw new Error("Completion file integrity mismatch");
      return { bytes: Buffer.from(bytes), mediaType: file.file.mediaType, originalName: file.file.originalName };
    } catch {
      throw new ServiceUnavailableException("Private completion file unavailable or integrity check failed");
    }
  }

  async prepareDecision(requestId: string, userId: string, body: unknown) {
    if (!(await this.isResolver(userId))) throw new ForbiddenException("RESOLVER platform role required");
    const input = this.parseDecisionBody(body);
    const [request] = await this.db.select().from(schema.campaignCompletionRequests).where(eq(schema.campaignCompletionRequests.id, requestId));
    if (!request) throw new NotFoundException("Completion request not found");
    await this.requestChain(request.campaignId);
    if (!["SUBMITTED_ON_CHAIN", "UNDER_REVIEW"].includes(request.status)) throw new ConflictException("Only a canonically submitted completion request can be decided");
    const decisionHash = this.decisionHash(request, input);
    const decision = await this.db.transaction(async tx => {
      const [saved] = await tx.insert(schema.campaignCompletionDecisions).values({ requestId, resolverUserId: userId, ...input, decisionHash }).onConflictDoNothing().returning();
      if (saved) return saved;
      const [existing] = await tx.select().from(schema.campaignCompletionDecisions).where(and(eq(schema.campaignCompletionDecisions.requestId, requestId), eq(schema.campaignCompletionDecisions.decisionHash, decisionHash)));
      if (!existing) throw new ConflictException("Decision was created concurrently; reload the request");
      return existing;
    });
    await this.db.update(schema.campaignCompletionRequests).set({ decisionHash, updatedAt: new Date() }).where(eq(schema.campaignCompletionRequests.id, requestId));
    return decisionDto(decision);
  }

  async listClaims(campaignId: string, userId: string) {
    const { reviewer } = await this.access(campaignId, userId);
    const claims = await this.db.select().from(schema.campaignSurplusClaims).where(and(
      eq(schema.campaignSurplusClaims.campaignId, campaignId),
      eq(schema.campaignSurplusClaims.streamId, this.indexer.streamId()),
      eq(schema.campaignSurplusClaims.canonical, true),
    )).orderBy(desc(schema.campaignSurplusClaims.createdAt));
    const visible = reviewer ? claims : claims.filter(claim => claim.backerUserId === userId);
    return visible.map(claim => ({
      id: claim.id, campaignId: claim.campaignId, backerWallet: claim.backerWallet, choice: claim.choice,
      recipient: claim.recipient, amount: claim.amount, transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber, createdAt: claim.createdAt,
    }));
  }
}
