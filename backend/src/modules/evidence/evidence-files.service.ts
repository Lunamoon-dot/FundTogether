import {
  BadRequestException, ConflictException, Inject, Injectable, Logger,
  NotFoundException, ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../../database/database.constants";
import * as schema from "../../database/schema";
import { evidenceDrafts, campaignMetadata } from "../../database/schema";
import { campaignAccessCondition } from "./evidence-access.service";
import { EvidenceDraftsService } from "./evidence-drafts.service";
import { EvidenceStorageService } from "./evidence-storage.service";
import type { EvidenceDraftContent } from "./evidence.schema";
import { MAX_EVIDENCE_FILES, validateEvidenceFile } from "./evidence-file-validation";
import type { EvidenceUploadFile } from "./evidence-file-validation";
export { MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES } from "./evidence-file-validation";
export type { EvidenceUploadFile } from "./evidence-file-validation";

@Injectable()
export class EvidenceFilesService {
  private readonly logger = new Logger(EvidenceFilesService.name);
  constructor(
    @Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>,
    private readonly drafts: EvidenceDraftsService,
    private readonly storage: EvidenceStorageService,
  ) {}

  async upload(campaignId: string, index: string, userId: string, expectedRevision: number,
    kind: EvidenceDraftContent["documents"][number]["kind"], file?: EvidenceUploadFile) {
    const draft = await this.drafts.get(campaignId, index, userId);
    if (draft.revision !== expectedRevision) throw new ConflictException("Draft changed; reload before uploading");
    if (draft.content.documents.length >= MAX_EVIDENCE_FILES) throw new BadRequestException("Maximum 20 files per evidence draft");
    const mediaType = await validateEvidenceFile(file);
    const objectId = randomUUID();
    const document: EvidenceDraftContent["documents"][number] = {
      documentId: objectId, storageObjectId: objectId, kind,
      originalName: file!.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document",
      mediaType,
      byteSize: file!.buffer.length, sha256: `0x${createHash("sha256").update(file!.buffer).digest("hex")}`,
      visibility: "RESTRICTED_ORIGINAL", relatesToExpenseIds: [], relatesToCriterionIds: [],
    };
    try {
      await this.storage.put(objectId, file!.buffer, document.mediaType);
      const [saved] = await this.database.update(evidenceDrafts).set({
        content: sql`jsonb_set(${evidenceDrafts.content}, '{documents}', (${evidenceDrafts.content}->'documents') || ${JSON.stringify([document])}::jsonb)`,
        revision: expectedRevision + 1, updatedAt: new Date(),
      }).where(and(
        eq(evidenceDrafts.id, draft.id), eq(evidenceDrafts.revision, expectedRevision),
        sql`exists (select 1 from ${campaignMetadata} where ${campaignMetadata.id} = ${evidenceDrafts.campaignMetadataId} and ${campaignAccessCondition(userId)})`,
      )).returning();
      if (!saved) throw new ConflictException("Draft or access changed; reload before uploading");
      return saved;
    } catch (error) {
      try { await this.storage.remove(objectId); } catch {
        this.logger.error(`Failed upload cleanup for object ${objectId}; storage reconciliation required`);
      }
      if (error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("File could not be saved; reload the draft before retrying");
    }
  }

  async download(campaignId: string, index: string, userId: string, documentId: string) {
    const draft = await this.drafts.get(campaignId, index, userId);
    const document = draft.content.documents.find((item) => item.documentId === documentId);
    if (!document || document.storageObjectId !== documentId || document.visibility !== "RESTRICTED_ORIGINAL") {
      throw new NotFoundException("Original document not found");
    }
    const object = await this.storage.get(documentId);
    if (!object.Body) throw new NotFoundException("Original document not found");
    return { document, body: object.Body };
  }
}
