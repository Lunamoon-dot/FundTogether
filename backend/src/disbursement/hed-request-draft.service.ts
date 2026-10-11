import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, hedCampaignDrafts, organizationMembers } from "../database/schema";
import { hedRequestDraftSchema } from "./hed-request-draft.schema";
import type { HedRequestDraftInput } from "./hed-request-draft.schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";

export const hedRequestHash = (campaignCommitmentHash: string, vendorReportHash: string, content: HedRequestDraftInput) => keccak256(toHex(JSON.stringify({
  version: "hed-mvp-1", campaignCommitmentHash, vendorReportHash, activityReference: content.activityReference,
  purpose: content.purpose, itemLines: content.itemLines, amount: content.amount, deposit: content.deposit,
  expectedDeliveryAt: content.expectedDeliveryAt, acceptanceCriteria: content.acceptanceCriteria, terms: content.terms,
  needEvidenceReferences: content.needEvidenceReferences,
})));

@Injectable()
export class HedRequestDraftService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService) {}

  private async campaign(campaignId: string, userId: string) {
    const [row] = await this.db.select({ campaign: campaignMetadata, draft: hedCampaignDrafts }).from(hedCampaignDrafts)
      .innerJoin(campaignMetadata, eq(campaignMetadata.id, hedCampaignDrafts.campaignMetadataId))
      .where(eq(campaignMetadata.id, campaignId)).limit(1);
    if (!row?.campaign.organizationId) throw new NotFoundException("HED campaign draft not found");
    const [member] = await this.db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, row.campaign.organizationId),
      eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER"))).limit(1);
    if (!member) throw new ForbiddenException("Organization OWNER membership required");
    if (!row.draft.frozenAt || !row.draft.commitmentHash) throw new ConflictException("Freeze the HED campaign before creating a payment request");
    return row;
  }

  private async verifiedVendor(id: string) {
    const [vendor] = await this.db.select().from(schema.hedVendorVerifications).where(eq(schema.hedVendorVerifications.id, id))
      .orderBy(desc(schema.hedVendorVerifications.createdAt)).limit(1);
    if (!vendor || vendor.status !== "VERIFIED" || vendor.validUntil.getTime() <= Date.now())
      throw new ConflictException("Vendor verification is missing, revoked, or expired");
    return vendor;
  }

  async list(campaignId: string, userId: string) {
    await this.campaign(campaignId, userId);
    return this.db.select().from(schema.hedRequestDrafts).where(eq(schema.hedRequestDrafts.campaignMetadataId, campaignId))
      .orderBy(desc(schema.hedRequestDrafts.createdAt));
  }

  async vendorOptions(campaignId: string, userId: string) {
    await this.campaign(campaignId, userId);
    return this.db.select({ id: schema.hedVendorVerifications.id, vendorWallet: schema.hedVendorVerifications.vendorWallet,
      content: schema.hedVendorVerifications.content, validUntil: schema.hedVendorVerifications.validUntil })
      .from(schema.hedVendorVerifications).where(and(eq(schema.hedVendorVerifications.status, "VERIFIED"),
        sql`${schema.hedVendorVerifications.validUntil} > now()`)).orderBy(desc(schema.hedVendorVerifications.createdAt));
  }

  async create(campaignId: string, userId: string, input: unknown) {
    const campaign = await this.campaign(campaignId, userId);
    const parsed = hedRequestDraftSchema.parse(input), vendor = await this.verifiedVendor(parsed.vendorVerificationId);
    return this.db.insert(schema.hedRequestDrafts).values({ campaignMetadataId: campaign.campaign.id, vendorVerificationId: vendor.id,
      content: parsed, createdBy: userId }).returning();
  }

  async uploadEvidence(campaignId: string, requestId: string, userId: string, kind: "QUOTE" | "NEED" | "TERMS" | "OTHER", file?: EvidenceUploadFile) {
    await this.campaign(campaignId, userId);
    const mediaType = await validateEvidenceFile(file), id = randomUUID();
    let stored = false;
    try {
      return await this.db.transaction(async tx => {
        const [draft] = await tx.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, requestId),
          eq(schema.hedRequestDrafts.campaignMetadataId, campaignId))).for("update");
        if (!draft) throw new NotFoundException("HED request draft not found");
        if (draft.frozenAt) throw new ConflictException("Frozen HED request cannot receive more evidence");
        const documents = await tx.select().from(schema.hedRequestEvidenceDocuments).where(eq(schema.hedRequestEvidenceDocuments.requestDraftId, requestId));
        if (documents.length >= 20) throw new ConflictException("At most 20 HED request evidence documents");
        await this.storage.put(id, file!.buffer, mediaType); stored = true;
        const document = { id, requestDraftId: requestId, uploadedBy: userId, kind,
          originalName: file!.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document",
          mediaType, byteSize: file!.buffer.length, sha256: `0x${createHash("sha256").update(file!.buffer).digest("hex")}` };
        await tx.insert(schema.hedRequestEvidenceDocuments).values(document);
        await tx.update(schema.hedRequestDrafts).set({ content: { ...draft.content, needEvidenceReferences: [...draft.content.needEvidenceReferences, id] },
          version: draft.version + 1, updatedAt: new Date() }).where(eq(schema.hedRequestDrafts.id, requestId));
        return document;
      });
    } catch (error) {
      if (stored) await this.storage.remove(id).catch(() => undefined);
      throw error;
    }
  }

  async freeze(campaignId: string, requestId: string, userId: string) {
    const campaign = await this.campaign(campaignId, userId);
    return this.db.transaction(async tx => {
      const [draft] = await tx.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, requestId),
        eq(schema.hedRequestDrafts.campaignMetadataId, campaign.campaign.id))).for("update");
      if (!draft) throw new NotFoundException("HED request draft not found");
      if (draft.frozenAt) throw new ConflictException("HED request draft is already frozen");
      const documents = await tx.select({ id: schema.hedRequestEvidenceDocuments.id }).from(schema.hedRequestEvidenceDocuments)
        .where(eq(schema.hedRequestEvidenceDocuments.requestDraftId, draft.id));
      if (!documents.length || documents.length !== draft.content.needEvidenceReferences.length
        || documents.some(document => !draft.content.needEvidenceReferences.includes(document.id)))
        throw new ConflictException("Upload and reload the server-owned request evidence before freezing");
      const [vendor] = await tx.select().from(schema.hedVendorVerifications).where(eq(schema.hedVendorVerifications.id, draft.vendorVerificationId)).for("share");
      if (!vendor || vendor.status !== "VERIFIED" || vendor.validUntil.getTime() <= Date.now()) throw new ConflictException("Vendor verification is no longer valid");
      const requestHash = hedRequestHash(campaign.draft.commitmentHash!, vendor.reportHash, draft.content);
      const [saved] = await tx.update(schema.hedRequestDrafts).set({ requestHash, frozenAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.hedRequestDrafts.id, draft.id), isNull(schema.hedRequestDrafts.frozenAt))).returning();
      if (!saved) throw new ConflictException("HED request changed; reload before freezing");
      return saved;
    });
  }
}
