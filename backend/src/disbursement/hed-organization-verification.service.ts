import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { randomUUID } from "node:crypto";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { hedOrganizationVerificationContentSchema, type HedOrganizationVerificationContent } from "./hed-organization-verification.schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile, type EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";

const policyId = "hed.organization-verification.v1";

@Injectable()
export class HedOrganizationVerificationService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService) {}

  private async owner(organizationId: string, userId: string) {
    const [membership] = await this.db.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, organizationId), eq(schema.organizationMembers.userId, userId), eq(schema.organizationMembers.role, "OWNER"))).limit(1);
    if (!membership) throw new ForbiddenException("Organization OWNER membership required");
  }

  private async admin(userId: string) {
    const [staff] = await this.db.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).limit(1);
    if (!staff?.roles.includes("ADMIN")) throw new ForbiddenException("Current ADMIN role required for organization verification");
  }

  async listForOrganization(organizationId: string, userId: string) {
    await this.owner(organizationId, userId);
    return this.db.select().from(schema.organizationVerificationRequests).where(eq(schema.organizationVerificationRequests.organizationId, organizationId)).orderBy(desc(schema.organizationVerificationRequests.createdAt));
  }

  async createOrSave(organizationId: string, userId: string, content: HedOrganizationVerificationContent) {
    await this.owner(organizationId, userId);
    const parsed = hedOrganizationVerificationContentSchema.safeParse(content);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.db.transaction(async tx => {
      const [organization] = await tx.select({ representativeWalletLinkId: schema.organizations.representativeWalletLinkId }).from(schema.organizations).where(eq(schema.organizations.id, organizationId)).for("update");
      if (!organization?.representativeWalletLinkId) throw new BadRequestException("Select a representative wallet before submitting organization verification");
      const [open] = await tx.select().from(schema.organizationVerificationRequests).where(and(eq(schema.organizationVerificationRequests.organizationId, organizationId), inArray(schema.organizationVerificationRequests.status, ["DRAFT", "CHANGES_REQUESTED"]))).orderBy(desc(schema.organizationVerificationRequests.updatedAt)).limit(1);
      if (open) {
        const [saved] = await tx.update(schema.organizationVerificationRequests).set({ content: parsed.data, missingItems: [], updatedAt: new Date() }).where(eq(schema.organizationVerificationRequests.id, open.id)).returning();
        return saved;
      }
      const [created] = await tx.insert(schema.organizationVerificationRequests).values({ organizationId, content: parsed.data, policyId, createdBy: userId }).returning();
      return created;
    });
  }

  async submit(requestId: string, userId: string) {
    return this.db.transaction(async tx => {
      const [request] = await tx.select().from(schema.organizationVerificationRequests).where(eq(schema.organizationVerificationRequests.id, requestId)).for("update");
      if (!request) throw new NotFoundException("Organization verification request not found");
      await this.owner(request.organizationId, userId);
      if (request.status !== "DRAFT" && request.status !== "CHANGES_REQUESTED") throw new ConflictException("Only a draft or changes-requested verification can be submitted");
      const [document] = await tx.select({ id: schema.organizationVerificationDocuments.id }).from(schema.organizationVerificationDocuments).where(eq(schema.organizationVerificationDocuments.requestId, requestId)).limit(1);
      if (!document) throw new BadRequestException("Upload at least one organization verification document before submitting");
      const [organization] = await tx.select({ wallet: schema.organizations.representativeWalletLinkId }).from(schema.organizations).where(eq(schema.organizations.id, request.organizationId));
      if (!organization?.wallet) throw new BadRequestException("Select a representative wallet before submitting organization verification");
      const snapshotBytes = JSON.stringify({ schemaVersion: policyId, organizationId: request.organizationId, content: request.content, representativeWalletLinkId: organization.wallet });
      const snapshotHash = keccak256(toHex(snapshotBytes));
      const [submitted] = await tx.update(schema.organizationVerificationRequests).set({ status: "UNDER_REVIEW", snapshotBytes, snapshotHash, submittedAt: new Date(), updatedAt: new Date() }).where(eq(schema.organizationVerificationRequests.id, requestId)).returning();
      await tx.insert(schema.organizationVerificationAudit).values({ organizationId: request.organizationId, requestId, actorId: userId, action: "SUBMITTED", changedFields: [] });
      return submitted;
    });
  }

  async uploadDocument(requestId: string, userId: string, file: EvidenceUploadFile) {
    const mediaType = await validateEvidenceFile(file);
    const id = randomUUID();
    const hash = keccak256(toHex(file.buffer));
    return this.db.transaction(async tx => {
      const [request] = await tx.select().from(schema.organizationVerificationRequests).where(eq(schema.organizationVerificationRequests.id, requestId)).for("update");
      if (!request) throw new NotFoundException("Organization verification request not found");
      await this.owner(request.organizationId, userId);
      if (request.status !== "DRAFT" && request.status !== "CHANGES_REQUESTED") throw new ConflictException("Documents can only be added before review");
      await this.storage.put(id, file.buffer, mediaType);
      try {
        const [document] = await tx.insert(schema.organizationVerificationDocuments).values({ id, organizationId: request.organizationId, requestId, uploadedBy: userId, kind: "REPRESENTATION", originalName: file.originalname.slice(0, 200), mediaType, byteSize: file.buffer.length, hash }).returning();
        await tx.insert(schema.organizationVerificationAudit).values({ organizationId: request.organizationId, requestId, actorId: userId, action: "DOCUMENT_ADDED", changedFields: [] });
        return document;
      } catch (error) { await this.storage.remove(id); throw error; }
    });
  }

  async queue(userId: string) {
    await this.admin(userId);
    return this.db.select({ id: schema.organizationVerificationRequests.id, organizationId: schema.organizationVerificationRequests.organizationId, content: schema.organizationVerificationRequests.content, submittedAt: schema.organizationVerificationRequests.submittedAt, createdBy: schema.organizationVerificationRequests.createdBy, organizationName: schema.organizations.name }).from(schema.organizationVerificationRequests).innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationVerificationRequests.organizationId)).where(eq(schema.organizationVerificationRequests.status, "UNDER_REVIEW")).orderBy(schema.organizationVerificationRequests.submittedAt);
  }

  async decide(requestId: string, userId: string, decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT", note: string, validUntil?: string) {
    await this.admin(userId);
    return this.db.transaction(async tx => {
      const [request] = await tx.select().from(schema.organizationVerificationRequests).where(eq(schema.organizationVerificationRequests.id, requestId)).for("update");
      if (!request) throw new NotFoundException("Organization verification request not found");
      if (request.status !== "UNDER_REVIEW") throw new ConflictException("Only an under-review request can be decided");
      const [owner] = await tx.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, request.organizationId), eq(schema.organizationMembers.userId, userId), eq(schema.organizationMembers.role, "OWNER"))).limit(1);
      if (owner) throw new ForbiddenException("An organization owner cannot decide that organization's verification");
      const now = new Date();
      if (decision === "APPROVE") {
        const expiry = new Date(validUntil!);
        if (expiry <= now) throw new BadRequestException("Verification expiry must be in the future");
        const reportBytes = JSON.stringify({ schemaVersion: policyId, requestId, snapshotHash: request.snapshotHash, checkedBy: userId, checkedAt: now.toISOString(), note, validUntil: expiry.toISOString() });
        const [record] = await tx.insert(schema.organizationVerificationRecords).values({ organizationId: request.organizationId, status: "VERIFIED", reportBytes, hash: keccak256(toHex(reportBytes)), checkedBy: userId, validUntil: expiry }).returning();
        await tx.update(schema.organizations).set({ verificationStatus: "verified", updatedAt: now }).where(eq(schema.organizations.id, request.organizationId));
        const [result] = await tx.update(schema.organizationVerificationRequests).set({ status: "APPROVED", reviewedAt: now, reviewedBy: userId, reviewNote: note, verificationRecordId: record.id, updatedAt: now }).where(eq(schema.organizationVerificationRequests.id, requestId)).returning();
        await tx.insert(schema.organizationVerificationAudit).values({ organizationId: request.organizationId, requestId, actorId: userId, action: "APPROVED", changedFields: [] });
        return result;
      }
      const status = decision === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "REJECTED";
      const [result] = await tx.update(schema.organizationVerificationRequests).set({ status, reviewedAt: now, reviewedBy: userId, reviewNote: note, missingItems: decision === "REQUEST_CHANGES" ? [note] : [], updatedAt: now }).where(eq(schema.organizationVerificationRequests.id, requestId)).returning();
      await tx.insert(schema.organizationVerificationAudit).values({ organizationId: request.organizationId, requestId, actorId: userId, action: status, changedFields: [] });
      return result;
    });
  }
}
