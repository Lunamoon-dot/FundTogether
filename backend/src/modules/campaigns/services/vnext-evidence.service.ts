import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as schema from "../../../database/schema";
import { DRIZZLE_DB } from "../../../database/database.constants";
import { EvidenceStorageService } from "../../evidence/evidence-storage.service";
import { EvidenceUploadFile, validateEvidenceFile } from "../../evidence/evidence-file-validation";
import type { AuthenticatedAccount } from "../../auth/auth.types";
import { VNEXT_CONNECTION, type VNextConnection } from "../../../indexer/vnext-indexer.service";
import { resolveVNextDossierAccess } from "../../../indexer/vnext-dossier-access";
import { matchesVNextEvidenceHash, vnextEvidenceSha256 } from "../../../indexer/vnext-evidence-integrity";

const summarySchema = z.strictObject({ summary: z.string().trim().min(1).max(5000) });
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

type VNextEvidence = typeof schema.vnextCaseEvidence.$inferSelect;

const dto = (item: VNextEvidence) => ({
  reviewCaseId: item.reviewCaseId,
  evidenceHash: item.evidenceHash,
  sha256: item.sha256,
  mediaType: item.mediaType,
  sizeBytes: item.sizeBytes,
  summary: item.summary,
  createdAt: item.createdAt,
});

@Injectable()
export class VNextEvidenceService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly storage: EvidenceStorageService,
    @Inject(VNEXT_CONNECTION) private readonly connection: VNextConnection | null,
  ) {}

  private streamId() {
    if (!this.connection) throw new ServiceUnavailableException("VNext deployment is not configured");
    const { manifest } = this.connection;
    return `vnext:${manifest.chainId}:${manifest.campaignEscrow}:${manifest.genesisHash}`;
  }

  private caseId(value: string) {
    if (!hashPattern.test(value)) throw new BadRequestException("Invalid VNext review case id");
    return value.toLowerCase();
  }

  private wallets(account: AuthenticatedAccount) {
    return account.wallets.filter(wallet => wallet.chainId === 31339).map(wallet => wallet.address.toLowerCase());
  }

  private async reviewAndAccess(reviewCaseId: string, account: AuthenticatedAccount) {
    const streamId = this.streamId();
    const [review] = await this.db.select().from(schema.vnextReviewProjections).where(
      and(eq(schema.vnextReviewProjections.streamId, streamId), eq(schema.vnextReviewProjections.reviewCaseId, reviewCaseId)),
    );
    if (!review) throw new NotFoundException("VNext review projection not found");
    const assignments = await this.db.select().from(schema.vnextJudgeAssignments).where(
      and(eq(schema.vnextJudgeAssignments.streamId, streamId), eq(schema.vnextJudgeAssignments.reviewCaseId, reviewCaseId)),
    );
    const access = resolveVNextDossierAccess({ ...review, assignments }, this.wallets(account));
    if (!access) throw new ForbiddenException("Creator or assigned Judge required");
    const relatedReviews = await this.db.select({ reviewCaseId: schema.vnextReviewProjections.reviewCaseId }).from(schema.vnextReviewProjections).where(
      and(eq(schema.vnextReviewProjections.streamId, streamId), eq(schema.vnextReviewProjections.rootCaseId, review.rootCaseId)),
    );
    const caseIds = [...new Set([reviewCaseId, review.rootCaseId, ...relatedReviews.map(item => item.reviewCaseId)])];
    return { streamId, review, assignments, access, caseIds };
  }

  private async canonicalEvidenceHash(streamId: string, reviewCaseIds: string[]) {
    const events = await this.db.select({ eventName: schema.vnextChainEvents.eventName, args: schema.vnextChainEvents.args })
      .from(schema.vnextChainEvents)
      .where(and(
        eq(schema.vnextChainEvents.streamId, streamId),
        eq(schema.vnextChainEvents.canonical, true),
        inArray(schema.vnextChainEvents.eventName, ["PublicationEvidenceSubmitted", "MilestoneEvidenceSubmitted"]),
      ));
    const event = events.find(item => reviewCaseIds.includes(String(item.args.reviewCaseId ?? "").toLowerCase()));
    const evidenceHash = String(event?.args.evidenceHash ?? "").toLowerCase();
    if (!event || !hashPattern.test(evidenceHash)) {
      throw new ConflictException("Canonical evidence event is not indexed for this review case");
    }
    return evidenceHash;
  }

  async list(reviewCaseIdInput: string, account: AuthenticatedAccount) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const { streamId, assignments, access, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    const items = await this.db.select().from(schema.vnextCaseEvidence).where(
      and(eq(schema.vnextCaseEvidence.streamId, streamId), inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds)),
    );
    return { access, assignments: access === "CREATOR" ? assignments : assignments.filter(item => this.wallets(account).includes(item.judgeAddress.toLowerCase())), evidence: items.map(dto) };
  }

  async upload(reviewCaseIdInput: string, account: AuthenticatedAccount, body: unknown, file?: EvidenceUploadFile) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const parsed = summarySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Evidence summary is required");
    const { streamId, review, access, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    if (access !== "CREATOR") throw new ForbiddenException("Only the canonical Creator can upload case evidence");
    if (review.enrolledCount !== "0" || review.finalized) throw new ConflictException("Evidence is frozen after Judge enrollment");
    const evidenceHash = await this.canonicalEvidenceHash(streamId, caseIds);
    const mediaType = await validateEvidenceFile(file);
    const sha256 = vnextEvidenceSha256(file!.buffer);
    if (!matchesVNextEvidenceHash(file!.buffer, evidenceHash)) throw new ConflictException("Uploaded bytes do not match the canonical evidence hash");
    const [existing] = await this.db.select().from(schema.vnextCaseEvidence).where(and(
      eq(schema.vnextCaseEvidence.streamId, streamId),
      inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds),
      eq(schema.vnextCaseEvidence.evidenceHash, evidenceHash),
    ));
    if (existing) return dto(existing);

    await this.storage.verifyPrivateBucket();
    const objectId = randomUUID();
    await this.storage.put(objectId, file!.buffer, mediaType);
    let objectOwnedByRow = false;
    try {
      const [saved] = await this.db.insert(schema.vnextCaseEvidence).values({
        streamId,
        reviewCaseId,
        ownerUserId: account.userId,
        objectId,
        sha256,
        mediaType,
        sizeBytes: file!.buffer.length,
        summary: parsed.data.summary,
        evidenceHash,
      }).onConflictDoNothing().returning();
      if (saved) {
        objectOwnedByRow = true;
        return dto(saved);
      }
      const [concurrent] = await this.db.select().from(schema.vnextCaseEvidence).where(and(
        eq(schema.vnextCaseEvidence.streamId, streamId),
        eq(schema.vnextCaseEvidence.reviewCaseId, reviewCaseId),
        eq(schema.vnextCaseEvidence.evidenceHash, evidenceHash),
      ));
      if (concurrent) return dto(concurrent);
      throw new ConflictException("Evidence was uploaded concurrently; reload the case");
    } catch (error) {
      throw error;
    } finally {
      if (!objectOwnedByRow) await this.storage.remove(objectId);
    }
  }

  async file(reviewCaseIdInput: string, evidenceHashInput: string, account: AuthenticatedAccount) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const evidenceHash = this.caseId(evidenceHashInput);
    const { streamId, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    const [item] = await this.db.select().from(schema.vnextCaseEvidence).where(and(
      eq(schema.vnextCaseEvidence.streamId, streamId),
      inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds),
      eq(schema.vnextCaseEvidence.evidenceHash, evidenceHash),
    ));
    if (!item) throw new NotFoundException("VNext case evidence not found");
    try {
      await this.storage.verifyPrivateBucket();
      const object = await this.storage.get(item.objectId);
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes || bytes.length !== item.sizeBytes || !matchesVNextEvidenceHash(bytes, item.sha256)) {
        throw new Error("Integrity mismatch");
      }
      return { bytes: Buffer.from(bytes), mediaType: item.mediaType };
    } catch {
      throw new ServiceUnavailableException("Private VNext evidence is unavailable or failed integrity verification");
    }
  }
}
