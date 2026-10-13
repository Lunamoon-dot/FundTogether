import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { editionsEvidence as evidence, editionsEntitlements as entitlements, editionsFeedback as feedback, editionsDownloadTickets as tickets, rewardCampaigns as campaigns, platformRoles } from "../database/schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { EvidenceUploadFile, validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import { digitalText } from "./reward-campaign.schema";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";
import { RewardEditionsPublicationService } from "./reward-editions-publication.service";
import { validateEditionsPdf } from "./reward-editions-pdf";

const zeroHash = `0x${"0".repeat(64)}`;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const uploadSchema = z.strictObject({ purpose: z.enum(["PRODUCTION_EVIDENCE", "FINAL_PDF"]), summary: digitalText(20, 5000) });
const feedbackSchema = z.strictObject({ targetHash: z.string().regex(/^0x[0-9a-f]{64}$/), kind: z.enum(["COMMENT", "ISSUE"]), body: z.string().trim().min(10).max(3000) });
type Evidence = typeof evidence.$inferSelect;
const dto = (item: Evidence) => ({ id: item.id, purpose: item.purpose, sha256: item.sha256, mediaType: item.mediaType,
  sizeBytes: item.sizeBytes, summary: item.summary, evidenceHash: item.evidenceHash, productionHash: item.productionHash, createdAt: item.createdAt });

@Injectable()
export class RewardEditionsDeliveryService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService,
    private readonly indexer: RewardEditionsIndexerService, private readonly publication: RewardEditionsPublicationService) {}

  private async campaign(id: string) {
    const [campaign] = await this.db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign?.draftConfig || campaign.category !== "COMICS_ARTBOOK") throw new NotFoundException("Editions campaign not found");
    return campaign;
  }
  private async reviewer(id: string, userId: string) {
    const campaign = await this.campaign(id);
    if (campaign.creatorUserId !== userId) {
      const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
      if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Creator or Resolver required");
    }
    return campaign;
  }
  private async chain(id: string) {
    const chain = await this.publication.chainCampaign(id);
    if (!chain.snapshot || chain.status !== "ON_CHAIN_CONFIRMED") throw new ConflictException("A canonical Editions campaign is required");
    return chain.snapshot;
  }
  private uploadAllowed(state: schema.EditionsChainSnapshot, purpose: Evidence["purpose"]) {
    if (state.state !== 1 || (purpose === "PRODUCTION_EVIDENCE" ? state.productionApproved || state.productionHash !== zeroHash : !state.productionApproved))
      throw new ConflictException("Evidence cannot change while its review is pending or accepted");
  }

  async upload(id: string, userId: string, body: unknown, file?: EvidenceUploadFile) {
    const campaign = await this.campaign(id);
    if (campaign.creatorUserId !== userId) throw new ForbiddenException("Only the creator can upload evidence");
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use one digital evidence file, purpose and public summary only");
    const input = parsed.data;
    const state = await this.chain(id);
    this.uploadAllowed(state, input.purpose);
    const mediaType = await validateEvidenceFile(file);
    if (input.purpose === "FINAL_PDF") {
      if (mediaType !== "application/pdf") throw new BadRequestException("The final deliverable must be a PDF");
      await validateEditionsPdf(file!.buffer);
    }
    const sha256 = `0x${hash(file!.buffer)}`;
    const streamId = this.indexer.streamId();
    const productionHash = input.purpose === "FINAL_PDF" ? state.productionHash : zeroHash;
    const evidenceHash = `0x${hash(JSON.stringify(["editions-evidence-v1", streamId, campaign.commitmentHash, input.purpose, sha256, mediaType, file!.buffer.length, input.summary, productionHash]))}`;
    const [existing] = await this.db.select().from(evidence).where(and(eq(evidence.campaignId, id), eq(evidence.streamId, streamId), eq(evidence.evidenceHash, evidenceHash)));
    if (existing) return dto(existing);
    await this.storage.verifyPrivateBucket();
    const objectId = randomUUID();
    await this.storage.put(objectId, file!.buffer, mediaType);
    try {
      return await this.db.transaction(async tx => {
        // Serialize uploads without blocking the indexer's FK key-share locks.
        await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, id)).for("no key update");
        const current = await this.chain(id);
        this.uploadAllowed(current, input.purpose);
        if (input.purpose === "FINAL_PDF" && current.productionHash !== productionHash) throw new ConflictException("Production evidence changed; reload");
        const all = await tx.select({ id: evidence.id }).from(evidence).where(eq(evidence.campaignId, id));
        if (all.length >= 20) throw new ConflictException("At most 20 evidence files per campaign");
        const [saved] = await tx.insert(evidence).values({ campaignId: id, streamId, ownerUserId: userId, objectId, sha256,
          mediaType, sizeBytes: file!.buffer.length, ...input, productionHash, evidenceHash }).onConflictDoNothing().returning();
        if (!saved) throw new ConflictException("This evidence was uploaded concurrently; reload the evidence list");
        return dto(saved);
      });
    } catch (error) { await this.storage.remove(objectId); throw error; }
  }

  async listEvidence(id: string, userId: string) {
    await this.reviewer(id, userId);
    return (await this.db.select().from(evidence).where(and(eq(evidence.campaignId, id), eq(evidence.streamId, this.indexer.streamId())))).map(dto);
  }
  private async bytes(item: Evidence) {
    try {
      await this.storage.verifyPrivateBucket();
      const object = await this.storage.get(item.objectId);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== item.sizeBytes || `0x${hash(bytes)}` !== item.sha256) throw new Error("Integrity mismatch");
      return Buffer.from(bytes);
    } catch { throw new ServiceUnavailableException("Private file unavailable or integrity check failed; an issue must be reviewed"); }
  }
  async readEvidence(id: string, evidenceId: string, userId: string) {
    await this.reviewer(id, userId);
    const [item] = await this.db.select().from(evidence).where(and(eq(evidence.campaignId, id), eq(evidence.id, evidenceId), eq(evidence.streamId, this.indexer.streamId())));
    if (!item) throw new NotFoundException("Evidence not found");
    return { bytes: await this.bytes(item), mediaType: item.mediaType };
  }

  async publicEvidence(id: string) {
    const state = await this.chain(id);
    const items = await this.db.select().from(evidence).where(and(eq(evidence.campaignId, id), eq(evidence.streamId, this.indexer.streamId())));
    return items.filter(item => item.evidenceHash === state.productionHash || item.evidenceHash === state.releaseEvidenceHash).map(dto);
  }
  async addFeedback(id: string, userId: string, body: unknown) {
    const campaign = await this.campaign(id);
    if (!["UNDER_REVIEW", "APPROVED"].includes(campaign.status) || !campaign.frozenSnapshot) throw new ConflictException("Campaign is not open for community review");
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Use a current target hash, COMMENT or ISSUE, and a bounded message");
    const input = parsed.data;
    if (input.targetHash !== campaign.commitmentHash) {
      const [items, chain] = await Promise.all([this.publicEvidence(id), this.publication.chainCampaign(id)]);
      if (!items.some(item => item.evidenceHash === input.targetHash) && !chain.challenges.some(item => item.evidenceHash === input.targetHash))
        throw new ConflictException("Feedback must identify the current reviewed terms, submitted evidence or canonical challenge");
    }
    return this.db.transaction(async tx => {
      await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, id)).for("no key update");
      const items = await tx.select().from(feedback).where(and(eq(feedback.campaignId, id), eq(feedback.authorUserId, userId)));
      const existing = items.find(item => item.targetHash === input.targetHash && item.kind === input.kind && item.body === input.body);
      if (existing) return existing; // Wallet rejection/retry must not duplicate or prevent a report.
      if (items.filter(item => item.kind !== "FILE_UNAVAILABLE").length >= 20) throw new ConflictException("At most 20 feedback messages per account and campaign");
      const [saved] = await tx.insert(feedback).values({ campaignId: id, authorUserId: userId, ...input, bodyHash: hash(input.body) }).returning();
      return saved;
    });
  }
  async feedback(id: string, userId: string) {
    const campaign = await this.campaign(id);
    const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
    const canReview = campaign.creatorUserId === userId || role?.roles.includes("RESOLVER");
    return this.db.select().from(feedback).where(and(eq(feedback.campaignId, id), canReview ? undefined : eq(feedback.authorUserId, userId)));
  }

  async listEntitlements(userId: string) {
    await this.indexer.runOnce();
    const items = await this.db.select().from(entitlements).where(eq(entitlements.backerUserId, userId));
    return Promise.all(items.map(async item => {
      let confirmedAt: Date | null = null;
      let access: "DOWNLOAD_ELIGIBLE" | "PENDING_RELEASE" | "REFUND_ELIGIBLE" | "REFUNDED" | "ORPHANED" = item.refunded ? "REFUNDED" : !item.canonical || item.streamId !== this.indexer.streamId() ? "ORPHANED" : "PENDING_RELEASE";
      if (item.canonical && !item.refunded && item.streamId === this.indexer.streamId()) {
        const [binding] = await this.db.select().from(schema.editionsChainCampaigns).where(and(eq(schema.editionsChainCampaigns.campaignId, item.campaignId), eq(schema.editionsChainCampaigns.streamId, item.streamId), eq(schema.editionsChainCampaigns.canonical, true)));
        if (binding?.snapshot.state === 4) access = "REFUND_ELIGIBLE";
        else if ([3, 5].includes(binding?.snapshot.state)) access = "DOWNLOAD_ELIGIBLE";
        if (access === "DOWNLOAD_ELIGIBLE" && binding?.snapshot.releaseEvidenceHash === item.confirmedEvidenceHash) confirmedAt = item.confirmedAt;
      }
      return { id: item.id, campaignId: item.campaignId, backerWallet: item.backerWallet, transactionHash: item.transactionHash, amountPaid: item.amountPaid, access, confirmedAt };
    }));
  }

  private async entitlementFile(id: string, userId: string) {
    // Check ownership before chain/storage access; rights are always refreshed again on download.
    const [owned] = await this.db.select().from(entitlements).where(and(eq(entitlements.id, id), eq(entitlements.backerUserId, userId)));
    if (!owned) throw new NotFoundException("Entitlement not found");
    const state = await this.chain(owned.campaignId);
    const [item] = await this.db.select().from(entitlements).where(eq(entitlements.id, id));
    if (!item.canonical || item.refunded || item.streamId !== this.indexer.streamId() || ![3, 5].includes(state.state) || !state.productionApproved)
      throw new ConflictException("Canonical payment and accepted release are required; refunded or orphaned claims cannot download");
    const [file] = await this.db.select().from(evidence).where(and(eq(evidence.campaignId, item.campaignId), eq(evidence.streamId, item.streamId),
      eq(evidence.purpose, "FINAL_PDF"), eq(evidence.sha256, state.pdfHash), eq(evidence.evidenceHash, state.releaseEvidenceHash), eq(evidence.productionHash, state.productionHash)));
    if (!file) {
      await this.fileIssue(item.campaignId, userId, state.releaseEvidenceHash);
      throw new ServiceUnavailableException("Accepted PDF metadata is unavailable; issue recorded for Resolver review");
    }
    return { item, file };
  }
  private async fileIssue(campaignId: string, userId: string, targetHash: string) {
    const body = "Server could not retrieve the accepted PDF with its committed content hash. Requires Resolver review; this report alone does not move funds.";
    await this.db.insert(feedback).values({ campaignId, authorUserId: userId, targetHash, kind: "FILE_UNAVAILABLE", body, bodyHash: hash(body) }).onConflictDoNothing();
  }
  private async availableBytes(item: typeof entitlements.$inferSelect, file: Evidence, userId: string) {
    try { return await this.bytes(file); }
    catch (error) { await this.fileIssue(item.campaignId, userId, file.evidenceHash); throw error; }
  }
  async issueTicket(id: string, userId: string) {
    const { item, file } = await this.entitlementFile(id, userId);
    await this.availableBytes(item, file, userId);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60000);
    await this.db.insert(tickets).values({ tokenHash: hash(token), entitlementId: id, evidenceId: file.id, userId, expiresAt });
    return { state: "DOWNLOAD_AVAILABLE", url: `/v1/reward/editions/downloads/${token}`, expiresAt, sha256: file.sha256 };
  }
  async download(token: string, userId: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new NotFoundException("Download not found");
    const [ticket] = await this.db.select().from(tickets).where(and(eq(tickets.tokenHash, hash(token)), eq(tickets.userId, userId)));
    if (!ticket || ticket.expiresAt.getTime() <= Date.now()) throw new NotFoundException("Download link expired or unavailable");
    const { item, file } = await this.entitlementFile(ticket.entitlementId, userId);
    if (file.id !== ticket.evidenceId) throw new ConflictException("Release no longer matches this download");
    const bytes = await this.availableBytes(item, file, userId);
    // Fail closed if rights changed while retrieving the object.
    await this.entitlementFile(ticket.entitlementId, userId);
    if (ticket.expiresAt.getTime() <= Date.now()) throw new NotFoundException("Download link expired or unavailable");
    await this.db.update(tickets).set({ requestedAt: sql`COALESCE(${tickets.requestedAt}, now())` }).where(eq(tickets.tokenHash, ticket.tokenHash));
    return bytes;
  }
  async confirm(id: string, userId: string) {
    const { file } = await this.entitlementFile(id, userId);
    const [item] = await this.db.update(entitlements).set({ confirmedEvidenceHash: file.evidenceHash,
      confirmedAt: sql`CASE WHEN ${entitlements.confirmedEvidenceHash} = ${file.evidenceHash} THEN COALESCE(${entitlements.confirmedAt}, now()) ELSE now() END` })
      .where(and(eq(entitlements.id, id), eq(entitlements.backerUserId, userId))).returning({ confirmedAt: entitlements.confirmedAt });
    return { state: "BACKER_CONFIRMED", ...item };
  }
}
