import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, organizationMembers } from "../database/schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { hedEvidencePackageSchema } from "./hed-evidence-package.schema";
import type { HedEvidencePackageInput } from "./hed-evidence-package.schema";

@Injectable()
export class HedEvidencePackageService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService) {}

  private async owner(campaignId: string, userId: string) {
    const [campaign] = await this.db.select().from(campaignMetadata).where(eq(campaignMetadata.id, campaignId)).limit(1);
    if (!campaign?.organizationId) throw new NotFoundException("HED campaign not found");
    const [member] = await this.db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, campaign.organizationId),
      eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER"))).limit(1);
    if (!member) throw new ForbiddenException("Organization OWNER membership required");
    return campaign;
  }

  private async activity(campaignId: string, activityId: string) {
    const [activity] = await this.db.select().from(schema.hedActivities).where(and(eq(schema.hedActivities.id, activityId),
      eq(schema.hedActivities.campaignMetadataId, campaignId))).limit(1);
    if (!activity?.onchainActivityId) throw new ConflictException("HED activity is not published on chain");
    return activity;
  }

  async upload(campaignId: string, userId: string, kind: "DELIVERY" | "OUTCOME", activityId: string, requestDraftId: string | undefined, file?: EvidenceUploadFile) {
    await this.owner(campaignId, userId); await this.activity(campaignId, activityId);
    if (kind === "DELIVERY" && !requestDraftId) throw new ConflictException("Delivery evidence requires a request");
    if (requestDraftId) {
      const [request] = await this.db.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, requestDraftId),
        eq(schema.hedRequestDrafts.campaignMetadataId, campaignId), eq(schema.hedRequestDrafts.activityId, activityId))).limit(1);
      if (!request) throw new NotFoundException("HED request does not belong to this activity");
    }
    const mediaType = await validateEvidenceFile(file), id = randomUUID(); let stored = false;
    try {
      await this.storage.put(id, file!.buffer, mediaType); stored = true;
      const [document] = await this.db.insert(schema.hedEvidenceDocuments).values({ id, campaignMetadataId: campaignId, activityId, requestDraftId,
        uploadedBy: userId, kind, originalName: file!.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document",
        mediaType, byteSize: file!.buffer.length, sha256: `0x${createHash("sha256").update(file!.buffer).digest("hex")}` }).returning();
      return document;
    } catch (error) { if (stored) await this.storage.remove(id).catch(() => undefined); throw error; }
  }

  async create(campaignId: string, userId: string, input: unknown) {
    await this.owner(campaignId, userId);
    const parsed = hedEvidencePackageSchema.parse(input); await this.activity(campaignId, parsed.activityId);
    if (parsed.kind === "DELIVERY") {
      const [request] = await this.db.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, parsed.requestDraftId),
        eq(schema.hedRequestDrafts.campaignMetadataId, campaignId), eq(schema.hedRequestDrafts.activityId, parsed.activityId))).limit(1);
      if (!request) throw new NotFoundException("HED delivery request does not belong to this activity");
    }
    const documents = await this.db.select().from(schema.hedEvidenceDocuments).where(and(eq(schema.hedEvidenceDocuments.campaignMetadataId, campaignId),
      eq(schema.hedEvidenceDocuments.activityId, parsed.activityId), inArray(schema.hedEvidenceDocuments.id, parsed.documentIds)));
    if (documents.length !== parsed.documentIds.length || documents.some(document => document.kind !== parsed.kind
      || (parsed.kind === "DELIVERY" && document.requestDraftId !== parsed.requestDraftId)))
      throw new ConflictException("Evidence package documents are not server-owned for this HED delivery or outcome");
    const [saved] = await this.db.insert(schema.hedEvidencePackages).values({ campaignMetadataId: campaignId, content: parsed, createdBy: userId }).returning();
    return saved;
  }

  async list(campaignId: string, userId: string) { await this.owner(campaignId, userId); return this.db.select().from(schema.hedEvidencePackages).where(eq(schema.hedEvidencePackages.campaignMetadataId, campaignId)).orderBy(schema.hedEvidencePackages.createdAt); }
}
