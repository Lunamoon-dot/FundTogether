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
import { payoutDecisionBodySchema, payoutRequestBodySchema, PayoutDecisionBody, PayoutRequestBody } from "../schemas/payout.schema";

const ACTIVE_STATE = 1;
const pendingStatuses = ["DRAFT", "SUBMITTED_ON_CHAIN", "UNDER_REVIEW"] as const;
const hash = (value: string | Uint8Array) => `0x${createHash("sha256").update(value).digest("hex")}`;

type Upload = EvidenceUploadFile & { originalname: string };
type PayoutUploads = { explanationFiles?: Upload[]; evidenceFiles?: Upload[] };
type PayoutRequest = typeof schema.campaignPayoutRequests.$inferSelect;
type PayoutFile = typeof schema.campaignPayoutRequestFiles.$inferSelect;

function fileDto(file: PayoutFile, campaignId: string, requestId: string) {
  return {
    id: file.id,
    purpose: file.purpose,
    originalName: file.originalName,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    createdAt: file.createdAt,
    downloadPath: `/v1/fundtogether/campaigns/${campaignId}/payout-requests/${requestId}/files/${file.id}`,
  };
}

function decisionDto(decision: typeof schema.campaignPayoutDecisions.$inferSelect) {
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

function requestDto(request: PayoutRequest, files: PayoutFile[], decisions: (typeof schema.campaignPayoutDecisions.$inferSelect)[]) {
  return {
    id: request.id,
    campaignId: request.campaignId,
    streamId: request.streamId,
    commitmentHash: request.commitmentHash,
    revision: request.revision,
    requestHash: request.requestHash,
    amount: request.amount,
    title: request.title,
    summary: request.summary,
    reason: request.reason,
    breakdown: request.breakdown,
    status: request.status,
    requestTxHash: request.requestTxHash,
    requestedAt: request.requestedAt,
    decisionHash: request.decisionHash,
    decisionTxHash: request.decisionTxHash,
    paidOutTxHash: request.paidOutTxHash,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    files: files.map(file => fileDto(file, request.campaignId, request.id)),
    decisions: decisions.map(decisionDto),
  };
}

@Injectable()
export class PayoutService {
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

  private async activeChain(campaignId: string) {
    const chain = await this.canonicalChain(campaignId);
    const snapshot = chain.snapshot!;
    if (snapshot.state !== ACTIVE_STATE) throw new ConflictException("Campaign must be active before requesting disbursement");
    if (BigInt(snapshot.escrowed) <= 0n) throw new ConflictException("No escrow is available for payout");
    return { chain, snapshot };
  }

  private async requestChain(campaignId: string, requestHash: string) {
    const chain = await this.canonicalChain(campaignId);
    if (chain.snapshot!.state !== ACTIVE_STATE) throw new ConflictException("The campaign is no longer active");
    if (chain.snapshot!.payoutRequestHash.toLowerCase() !== requestHash.toLowerCase()) throw new ConflictException("The payout request is not canonically pending");
    return chain;
  }

  private parseRequestBody(body: unknown): PayoutRequestBody {
    const parsed = payoutRequestBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use amount, title, summary, reason and breakdown with no unknown fields");
    return parsed.data;
  }

  private parseDecisionBody(body: unknown): PayoutDecisionBody {
    const parsed = payoutDecisionBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use APPROVE, CHANGES_REQUESTED or REJECT and a bounded reason");
    return parsed.data;
  }

  private async latestRequests(campaignId: string, streamId: string) {
    return this.db.select().from(schema.campaignPayoutRequests)
      .where(and(eq(schema.campaignPayoutRequests.campaignId, campaignId), eq(schema.campaignPayoutRequests.streamId, streamId)))
      .orderBy(desc(schema.campaignPayoutRequests.revision));
  }

  private requestHash(campaign: Awaited<ReturnType<PayoutService["campaign"]>>, streamId: string, revision: number, input: PayoutRequestBody, files: { purpose: schema.CampaignPayoutFilePurpose; sha256: string; mediaType: string; sizeBytes: number; originalName: string }[]) {
    return hash(JSON.stringify([
      "fundtogether-payout-request-v2",
      campaign.id,
      streamId,
      campaign.commitmentHash,
      campaign.frozenSnapshot?.payoutWallet.address,
      revision,
      input,
      files.map(file => ({ purpose: file.purpose, sha256: file.sha256, mediaType: file.mediaType, sizeBytes: file.sizeBytes, originalName: file.originalName })),
    ]));
  }

  private decisionHash(request: PayoutRequest, input: PayoutDecisionBody) {
    return hash(JSON.stringify(["fundtogether-payout-decision-v1", request.id, request.requestHash, request.revision, input.outcome, input.reason]));
  }

  async create(campaignId: string, userId: string, body: unknown, files?: PayoutUploads) {
    const campaign = await this.campaign(campaignId);
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only the Creator can submit a payout request");
    const input = this.parseRequestBody(body);
    const streamId = this.indexer.streamId();
    const existing = await this.latestRequests(campaignId, streamId);
    if (existing.some(item => pendingStatuses.includes(item.status as typeof pendingStatuses[number])))
      throw new ConflictException("A payout request is already pending for this campaign");
    const revision = (existing[0]?.revision ?? 0) + 1;
    const explanationFiles = files?.explanationFiles ?? [];
    const evidenceFiles = files?.evidenceFiles ?? [];
    const requestedFiles = [
      ...explanationFiles.map(file => ({ file, purpose: "USE_EXPLANATION" as const })),
      ...evidenceFiles.map(file => ({ file, purpose: "PREVIOUS_USE_EVIDENCE" as const })),
    ];
    if (explanationFiles.length === 0) throw new BadRequestException("Every disbursement request must include a detailed use-of-funds explanation file");
    if (revision > 1 && evidenceFiles.length === 0) throw new BadRequestException("A later disbursement request must include evidence of the previous use");
    if (requestedFiles.length > MAX_EVIDENCE_FILES) throw new BadRequestException("At most 20 supporting files are allowed");
    if (requestedFiles.some(item => item.file.buffer.length > MAX_EVIDENCE_FILE_BYTES)) throw new BadRequestException("Each supporting file must be at most 10 MiB");

    const { snapshot } = await this.activeChain(campaignId);
    if (BigInt(input.amount) > BigInt(snapshot.escrowed)) throw new ConflictException("Disbursement amount exceeds the canonical escrow balance");
    if (BigInt(input.amount) > BigInt(snapshot.goal) - BigInt(snapshot.creatorPaid)) throw new ConflictException("Disbursement amount exceeds the remaining Creator goal");

    const preparedFiles: { file: Upload; purpose: schema.CampaignPayoutFilePurpose; mediaType: string; sha256: string; objectId: string }[] = [];
    try {
      if (requestedFiles.length > 0) await this.storage.verifyPrivateBucket();
      for (const item of requestedFiles) {
        const mediaType = await validateEvidenceFile(item.file);
        const objectId = randomUUID();
        const sha256 = hash(item.file.buffer);
        await this.storage.put(objectId, item.file.buffer, mediaType);
        preparedFiles.push({ file: item.file, purpose: item.purpose, mediaType, sha256, objectId });
      }
      const requestHash = this.requestHash(campaign, streamId, revision, input, preparedFiles.map(item => ({
        purpose: item.purpose,
        sha256: item.sha256, mediaType: item.mediaType, sizeBytes: item.file.buffer.length, originalName: item.file.originalname,
      })));
      const saved = await this.db.transaction(async tx => {
        await tx.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.id, campaignId)).for("update");
        const current = await tx.select().from(schema.campaignPayoutRequests)
          .where(and(eq(schema.campaignPayoutRequests.campaignId, campaignId), eq(schema.campaignPayoutRequests.streamId, streamId)))
          .orderBy(desc(schema.campaignPayoutRequests.revision));
        if (current.some(item => pendingStatuses.includes(item.status as typeof pendingStatuses[number]))) throw new ConflictException("A payout request is already pending for this campaign");
        const currentRevision = (current[0]?.revision ?? 0) + 1;
        if (currentRevision !== revision) throw new ConflictException("A payout request revision changed; reload and try again");
        const [request] = await tx.insert(schema.campaignPayoutRequests).values({
          campaignId, streamId, creatorUserId: userId, commitmentHash: campaign.commitmentHash!, revision, requestHash,
          amount: input.amount, title: input.title, summary: input.summary, reason: input.reason, breakdown: input.breakdown,
        }).returning();
        if (!request) throw new ConflictException("Could not create payout request");
        const fileRows = await tx.insert(schema.campaignPayoutRequestFiles).values(preparedFiles.map(item => ({
          requestId: request.id, purpose: item.purpose, objectId: item.objectId, originalName: item.file.originalname.slice(0, 255),
          sha256: item.sha256, mediaType: item.mediaType, sizeBytes: item.file.buffer.length,
        }))).returning();
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
    const requests = await this.db.select().from(schema.campaignPayoutRequests)
      .where(and(eq(schema.campaignPayoutRequests.campaignId, campaignId), eq(schema.campaignPayoutRequests.streamId, streamId)))
      .orderBy(desc(schema.campaignPayoutRequests.revision));
    const visible = reviewer ? requests : requests.filter(request => request.status !== "DRAFT");
    if (!visible.length) return [];
    const requestIds = visible.map(request => request.id);
    const [files, decisions] = await Promise.all([
      this.db.select().from(schema.campaignPayoutRequestFiles).where(inArray(schema.campaignPayoutRequestFiles.requestId, requestIds)),
      this.db.select().from(schema.campaignPayoutDecisions).where(inArray(schema.campaignPayoutDecisions.requestId, requestIds)).orderBy(desc(schema.campaignPayoutDecisions.createdAt)),
    ]);
    return visible.map(request => requestDto(request, files.filter(file => file.requestId === request.id), decisions.filter(decision => decision.requestId === request.id)));
  }

  private async loadFile(campaignId: string, requestId: string, fileId: string, userId: string) {
    await this.access(campaignId, userId);
    const [file] = await this.db.select({ file: schema.campaignPayoutRequestFiles, request: schema.campaignPayoutRequests })
      .from(schema.campaignPayoutRequestFiles)
      .innerJoin(schema.campaignPayoutRequests, eq(schema.campaignPayoutRequests.id, schema.campaignPayoutRequestFiles.requestId))
      .where(and(
        eq(schema.campaignPayoutRequestFiles.id, fileId),
        eq(schema.campaignPayoutRequestFiles.requestId, requestId),
        eq(schema.campaignPayoutRequests.campaignId, campaignId),
        eq(schema.campaignPayoutRequests.streamId, this.indexer.streamId()),
      ));
    if (!file || file.request.status === "DRAFT") throw new NotFoundException("Payout file not found");
    try {
      await this.storage.verifyPrivateBucket();
      const object = await this.storage.get(file.file.objectId);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== file.file.sizeBytes || hash(bytes) !== file.file.sha256) throw new Error("Payout file integrity mismatch");
      return { bytes: Buffer.from(bytes), mediaType: file.file.mediaType, originalName: file.file.originalName };
    } catch {
      throw new ServiceUnavailableException("Private payout file unavailable or integrity check failed");
    }
  }

  async readFile(campaignId: string, requestId: string, fileId: string, userId: string) {
    return this.loadFile(campaignId, requestId, fileId, userId);
  }

  async prepareDecision(requestId: string, userId: string, body: unknown) {
    if (!(await this.isResolver(userId))) throw new ForbiddenException("RESOLVER platform role required");
    const input = this.parseDecisionBody(body);
    const [request] = await this.db.select().from(schema.campaignPayoutRequests).where(eq(schema.campaignPayoutRequests.id, requestId));
    if (!request) throw new NotFoundException("Payout request not found");
    await this.requestChain(request.campaignId, request.requestHash);
    if (!["SUBMITTED_ON_CHAIN", "UNDER_REVIEW"].includes(request.status)) throw new ConflictException("Only a canonically submitted payout request can be decided");
    const decisionHash = this.decisionHash(request, input);
    const decision = await this.db.transaction(async tx => {
      const [saved] = await tx.insert(schema.campaignPayoutDecisions).values({ requestId, resolverUserId: userId, ...input, decisionHash }).onConflictDoNothing().returning();
      if (saved) return saved;
      const [existing] = await tx.select().from(schema.campaignPayoutDecisions).where(and(eq(schema.campaignPayoutDecisions.requestId, requestId), eq(schema.campaignPayoutDecisions.decisionHash, decisionHash)));
      if (!existing) throw new ConflictException("Decision was created concurrently; reload the request");
      return existing;
    });
    await this.db.update(schema.campaignPayoutRequests).set({ decisionHash, updatedAt: new Date() }).where(eq(schema.campaignPayoutRequests.id, requestId));
    return decisionDto(decision);
  }
}
