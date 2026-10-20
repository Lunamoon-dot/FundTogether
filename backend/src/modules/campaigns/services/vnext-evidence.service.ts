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
import { sql } from "drizzle-orm";
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
import { vnextReviewAbi } from "../../../blockchain/vnext-deployment";
import {
  resolveVNextEvidenceAvailability,
  type VNextEvidenceObjectState,
  type VNextEvidenceReviewPhase,
} from "./vnext-evidence-availability";
import {
  createVNextEvidenceAccessTicket,
  hashVNextEvidenceAccessToken,
  isVNextEvidenceAccessTicketExpired,
} from "./vnext-evidence-access-ticket";

const summarySchema = z.strictObject({ summary: z.string().trim().min(1).max(5000) });
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

type VNextEvidence = typeof schema.vnextCaseEvidence.$inferSelect;
type VNextReview = typeof schema.vnextReviewProjections.$inferSelect;

const dto = (item: VNextEvidence) => ({
  reviewCaseId: item.reviewCaseId,
  evidenceHash: item.evidenceHash,
  sha256: item.sha256,
  mediaType: item.mediaType,
  sizeBytes: item.sizeBytes,
  summary: item.summary,
  createdAt: item.createdAt,
});

const ROUND_VOTING = 3;
const ROUND_FINALIZED = 4;

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
    const relatedReviews = await this.db.select({ reviewCaseId: schema.vnextReviewProjections.reviewCaseId }).from(schema.vnextReviewProjections).where(
      and(eq(schema.vnextReviewProjections.streamId, streamId), eq(schema.vnextReviewProjections.rootCaseId, review.rootCaseId)),
    );
    const caseIds = [...new Set([reviewCaseId, review.rootCaseId, ...relatedReviews.map(item => item.reviewCaseId)])];
    const [challenge] = await this.db.select({ challenger: schema.vnextChallengeProjections.challenger }).from(schema.vnextChallengeProjections).where(
      and(eq(schema.vnextChallengeProjections.streamId, streamId), inArray(schema.vnextChallengeProjections.challengeCaseId, caseIds)),
    );
    const assignments = await this.db.select().from(schema.vnextJudgeAssignments).where(
      and(eq(schema.vnextJudgeAssignments.streamId, streamId), eq(schema.vnextJudgeAssignments.reviewCaseId, reviewCaseId)),
    );
    const access = resolveVNextDossierAccess({ ...review, challenger: challenge?.challenger, assignments }, this.wallets(account));
    if (!access) throw new ForbiddenException("Creator, canonical Challenger or assigned Judge required");
    return { streamId, review, assignments, access, caseIds };
  }

  private async canonicalEvidenceHash(streamId: string, reviewCaseIds: string[]) {
    const events = await this.db.select({ eventName: schema.vnextChainEvents.eventName, args: schema.vnextChainEvents.args })
      .from(schema.vnextChainEvents)
      .where(and(
        eq(schema.vnextChainEvents.streamId, streamId),
        eq(schema.vnextChainEvents.canonical, true),
        inArray(schema.vnextChainEvents.eventName, ["PublicationEvidenceSubmitted", "MilestoneEvidenceSubmitted", "ChallengeOpened"]),
      ));
    const event = events.find(item => reviewCaseIds.includes(String(item.args.reviewCaseId ?? "").toLowerCase()));
    const evidenceHash = String(event?.args.evidenceHash ?? "").toLowerCase();
    if (!event || !hashPattern.test(evidenceHash)) {
      throw new ConflictException("Canonical evidence event is not indexed for this review case");
    }
    return evidenceHash;
  }

  private async availabilityPolicy(
    reviewCaseId: string,
    review: VNextReview,
    objectState: VNextEvidenceObjectState,
  ) {
    if (!this.connection) throw new ServiceUnavailableException("VNext deployment is not configured");
    const [roundStatus, enrollmentDeadline, revealDeadline] = await Promise.all([
      this.connection.client.readContract({ address: this.connection.manifest.juryReview, abi: vnextReviewAbi, functionName: "roundStatus", args: [reviewCaseId as `0x${string}`] }),
      this.connection.client.readContract({ address: this.connection.manifest.juryReview, abi: vnextReviewAbi, functionName: "enrollmentDeadline", args: [reviewCaseId as `0x${string}`] }),
      this.connection.client.readContract({ address: this.connection.manifest.juryReview, abi: vnextReviewAbi, functionName: "revealDeadline", args: [reviewCaseId as `0x${string}`] }),
    ]);
    const status = Number(roundStatus);
    const reviewPhase: VNextEvidenceReviewPhase = status >= ROUND_FINALIZED
      ? "FINALIZED"
      : status === ROUND_VOTING
        ? "VOTING"
        : "ENROLLMENT";
    const timeoutAtSeconds = reviewPhase === "FINALIZED"
      ? null
      : BigInt(String(reviewPhase === "VOTING" ? revealDeadline : enrollmentDeadline));
    const policy = resolveVNextEvidenceAvailability({
      objectState,
      reviewPhase,
      nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
      timeoutAtSeconds,
    });
    return {
      status: policy.status,
      reviewPhase,
      timeoutAtSeconds: policy.timeoutAtSeconds?.toString() ?? null,
      reviewCaseId: review.reviewCaseId,
    };
  }

  async list(reviewCaseIdInput: string, account: AuthenticatedAccount) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const { streamId, review, assignments, access, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    const items = await this.db.select().from(schema.vnextCaseEvidence).where(
      and(eq(schema.vnextCaseEvidence.streamId, streamId), inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds)),
    );
    const availabilityByObject = new Map<string, Awaited<ReturnType<EvidenceStorageService["availability"]>>>();
    const evidence = await Promise.all(items.map(async item => {
      const availability = await this.storage.availability(item.objectId);
      availabilityByObject.set(item.evidenceHash, availability);
      return { ...dto(item), availability };
    }));
    let canonicalHash: string | null = null;
    try {
      canonicalHash = await this.canonicalEvidenceHash(streamId, caseIds);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
    const objectState: VNextEvidenceObjectState = canonicalHash === null
      ? "NOT_INDEXED"
      : availabilityByObject.get(canonicalHash) ?? "MISSING";
    const availabilityPolicy = await this.availabilityPolicy(reviewCaseId, review, objectState);
    return {
      access,
      assignments: access === "CREATOR"
        ? assignments
        : access === "JUDGE"
          ? assignments.filter(item => this.wallets(account).includes(item.judgeAddress.toLowerCase()))
          : [],
      evidence,
      canonicalEvidenceHash: canonicalHash,
      availabilityPolicy,
    };
  }

  async upload(reviewCaseIdInput: string, account: AuthenticatedAccount, body: unknown, file?: EvidenceUploadFile) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const parsed = summarySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Evidence summary is required");
    const { streamId, review, access, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    if (access !== "CREATOR" && access !== "CHALLENGER") throw new ForbiddenException("Only the Creator or canonical Challenger can upload case evidence");
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

  private async readEvidence(item: VNextEvidence) {
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

  async issueTicket(reviewCaseIdInput: string, evidenceHashInput: string, account: AuthenticatedAccount) {
    const reviewCaseId = this.caseId(reviewCaseIdInput);
    const evidenceHash = this.caseId(evidenceHashInput);
    const { streamId, caseIds } = await this.reviewAndAccess(reviewCaseId, account);
    const canonicalHash = await this.canonicalEvidenceHash(streamId, caseIds);
    if (canonicalHash !== evidenceHash) throw new ConflictException("Evidence is not the canonical case revision");
    const [item] = await this.db.select().from(schema.vnextCaseEvidence).where(and(
      eq(schema.vnextCaseEvidence.streamId, streamId),
      inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds),
      eq(schema.vnextCaseEvidence.evidenceHash, evidenceHash),
    ));
    if (!item) throw new NotFoundException("VNext case evidence not found");
    await this.readEvidence(item);
    const ticket = createVNextEvidenceAccessTicket();
    await this.db.insert(schema.vnextEvidenceAccessTickets).values({
      tokenHash: ticket.tokenHash,
      streamId,
      reviewCaseId,
      evidenceHash,
      userId: account.userId,
      expiresAt: ticket.expiresAt,
    });
    return {
      state: "EVIDENCE_AVAILABLE",
      url: `/v1/fundtogether/vnext/reviews/evidence-downloads/${ticket.token}`,
      expiresAt: ticket.expiresAt,
      sha256: item.sha256,
    };
  }

  async downloadTicket(tokenInput: string, account: AuthenticatedAccount) {
    let tokenHash: string;
    try {
      tokenHash = hashVNextEvidenceAccessToken(tokenInput);
    } catch {
      throw new NotFoundException("Evidence access ticket not found");
    }
    const [ticket] = await this.db.select().from(schema.vnextEvidenceAccessTickets).where(and(
      eq(schema.vnextEvidenceAccessTickets.tokenHash, tokenHash),
      eq(schema.vnextEvidenceAccessTickets.userId, account.userId),
    ));
    if (!ticket || isVNextEvidenceAccessTicketExpired(ticket.expiresAt)) {
      throw new NotFoundException("Evidence access ticket expired or unavailable");
    }
    const { streamId, caseIds } = await this.reviewAndAccess(ticket.reviewCaseId, account);
    if (streamId !== ticket.streamId) throw new NotFoundException("Evidence access ticket unavailable");
    const [item] = await this.db.select().from(schema.vnextCaseEvidence).where(and(
      eq(schema.vnextCaseEvidence.streamId, streamId),
      inArray(schema.vnextCaseEvidence.reviewCaseId, caseIds),
      eq(schema.vnextCaseEvidence.evidenceHash, ticket.evidenceHash),
    ));
    if (!item) throw new NotFoundException("VNext case evidence not found");
    const file = await this.readEvidence(item);
    if (isVNextEvidenceAccessTicketExpired(ticket.expiresAt)) throw new NotFoundException("Evidence access ticket expired or unavailable");
    await this.db.update(schema.vnextEvidenceAccessTickets).set({ requestedAt: sql`COALESCE(${schema.vnextEvidenceAccessTickets.requestedAt}, now())` }).where(eq(schema.vnextEvidenceAccessTickets.tokenHash, tokenHash));
    return file;
  }
}
