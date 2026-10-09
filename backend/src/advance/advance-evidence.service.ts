import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { AdvanceReviewService } from "./advance-review.service";
import { restoreGiftPlan, sha256 } from "./advance-plan";
import { advanceEvidenceContentSchema, advanceEvidencePackageSchema, advancePublicManifestSchema } from "./advance-evidence.schema";
import type { AdvanceEvidenceContent } from "./advance-evidence.schema";
type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export function validateEvidenceUpdate(previous: AdvanceEvidenceContent, input: unknown, criteria: { criterionId: string }[]) {
  const parsed = advanceEvidenceContentSchema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  const content = parsed.data, originals = new Map(previous.documents.map(d => [d.documentId, d]));
  const immutable = (d: AdvanceEvidenceContent["documents"][number]) => JSON.stringify({ documentId: d.documentId,
    storageObjectId: d.storageObjectId, kind: d.kind, originalName: d.originalName, mediaType: d.mediaType,
    byteSize: d.byteSize, sha256: d.sha256, visibility: d.visibility });
  if (content.documents.length !== originals.size || content.documents.some(d => !originals.has(d.documentId)
    || immutable(d) !== immutable(originals.get(d.documentId)!)))
    throw new BadRequestException("Document metadata is server-owned; upload files before linking evidence");
  const ids = new Set(criteria.map(c => c.criterionId));
  if (new Set(content.report.outcomes.map(o => o.criterionId)).size !== content.report.outcomes.length
    || content.report.outcomes.some(o => !ids.has(o.criterionId))
    || content.documents.some(d => new Set(d.relatesToCriterionIds).size !== d.relatesToCriterionIds.length
      || d.relatesToCriterionIds.some(id => !ids.has(id)))) throw new BadRequestException("References must use frozen stage criteria");
  return content;
}

@Injectable()
export class AdvanceEvidenceService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly chain: AdvanceBlockchainService, private readonly storage: EvidenceStorageService,
    private readonly reviews: AdvanceReviewService) {}

  private async target(tx: Tx, id: string, index: string, userId: string, manage = true) {
    if (!/^(0|[1-9]\d{0,77})$/.test(index)) throw new BadRequestException("Invalid stage index");
    const [row] = await tx.select({ campaign: schema.campaignMetadata, plan: schema.advanceCampaignPlans }).from(schema.advanceCampaignPlans)
      .innerJoin(schema.campaignMetadata, eq(schema.advanceCampaignPlans.campaignMetadataId, schema.campaignMetadata.id))
      .where(and(eq(schema.advanceCampaignPlans.campaignMetadataId, id), eq(schema.advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
        eq(schema.advanceCampaignPlans.chainId, this.chain.context.chainId), eq(schema.advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase()))).for(manage ? "update" : "share");
    if (!row?.campaign.organizationId || !row.plan.frozenAt) throw new NotFoundException("Frozen B campaign not found");
    const [owner] = await tx.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, row.campaign.organizationId),
      eq(schema.organizationMembers.userId, userId), eq(schema.organizationMembers.role, "OWNER"))).for("share");
    if (!owner) {
      const [role] = await tx.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).for("share");
      if (manage || !role?.roles.includes("RESOLVER")) throw new ForbiddenException("Original evidence requires current OWNER or reviewer access");
    }
    const plan = restoreGiftPlan(row.plan, this.chain.deployment), frozen = JSON.parse(plan.planBytes);
    if (BigInt(index) >= BigInt(plan.budgets.length)) throw new NotFoundException("Stage not found");
    await this.chain.verifyDeployment();
    const block = await this.chain.client.getBlock();
    const mapped = await this.chain.read("campaignForDraft", [plan.organizer, plan.draftKey], block.number) as bigint;
    if (!mapped) throw new ConflictException("Campaign submission not confirmed on B chain");
    const snapshot = await this.chain.snapshot(mapped - 1n, block.number);
    if (snapshot.campaign.organizer.toLowerCase() !== plan.organizer.toLowerCase() || snapshot.campaign.planHash !== plan.planHash
      || snapshot.stages.length !== plan.budgets.length || snapshot.stages.some((s, i) => s.budget !== plan.budgets[i] || s.criteriaHash !== plan.criteriaHashes[i]))
      throw new ConflictException("Chain campaign and frozen evidence target differ");
    if (!owner) {
      const wallets = await tx.select().from(schema.walletLinks).where(and(eq(schema.walletLinks.userId, userId), eq(schema.walletLinks.chainId, "31338"))).for("share");
      for (const wallet of wallets) if (await this.chain.read("contributions", [mapped - 1n, wallet.address], block.number) as bigint > 0n)
        throw new ForbiddenException("Conflicted contributor cannot access original as reviewer");
    }
    return { ...row, plan, frozen, snapshot, stage: snapshot.stages[Number(index)] };
  }

  private editable(target: Awaited<ReturnType<AdvanceEvidenceService["target"]>>, index: string) {
    const { snapshot: s, stage } = target, now = BigInt(s.checkpoint.chainTimestamp);
    if (!["EXECUTING", "SUPPLEMENT_DUE"].includes(s.campaign.state) || s.campaign.currentStage !== index
      || now >= BigInt(stage.submissionEnd) || now >= BigInt(stage.hardStop) || BigInt(stage.latestVersion) >= 3n)
      throw new ConflictException("Current stage cannot receive evidence before its deadline");
  }

  private async assertNoPreparedVersion(tx: Tx, id: string, index: string, latestVersion: string) {
    const [prepared] = await tx.select().from(schema.evidencePackages).where(and(eq(schema.evidencePackages.campaignMetadataId, id),
      eq(schema.evidencePackages.milestoneIndex, index), eq(schema.evidencePackages.submissionVersion, Number(latestVersion) + 1)));
    if (prepared) throw new ConflictException("Prepared evidence version is immutable; submit it before editing a supplement");
  }

  async assertUploadOwner(id: string, index: string, userId: string) {
    await this.db.transaction(async tx => { const t = await this.target(tx, id, index, userId); this.editable(t, index); });
  }
  async assertPublicationOwner(packageId: string, userId: string) {
    await this.db.transaction(async tx => { await this.package(tx, packageId, userId, true); });
  }

  private async draft(tx: Tx, id: string, index: string, revision?: number) {
    const [draft] = await tx.select().from(schema.evidenceDrafts).where(and(eq(schema.evidenceDrafts.campaignMetadataId, id),
      eq(schema.evidenceDrafts.milestoneIndex, index))).for("update");
    if (!draft || draft.evidenceSchemaVersion !== "0.2") throw new NotFoundException("B evidence draft not found");
    if (revision !== undefined && draft.revision !== revision) throw new ConflictException("Evidence revision changed; reload");
    const content = advanceEvidenceContentSchema.parse(draft.content);
    return { ...draft, content };
  }

  async get(id: string, index: string, userId: string) {
    return this.db.transaction(async tx => {
      await this.target(tx, id, index, userId);
      return this.draft(tx, id, index);
    });
  }

  async save(id: string, index: string, userId: string, expectedRevision: number, input: unknown) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647)
      throw new BadRequestException("Invalid expected revision");
    return this.db.transaction(async tx => {
      const target = await this.target(tx, id, index, userId);
      this.editable(target, index);
      await this.assertNoPreparedVersion(tx, id, index, target.stage.latestVersion);
      // The locked campaign also serializes creation when the draft row does not exist yet.
      if (expectedRevision === 0) {
        const [existing] = await tx.select().from(schema.evidenceDrafts).where(and(eq(schema.evidenceDrafts.campaignMetadataId, id), eq(schema.evidenceDrafts.milestoneIndex, index)));
        if (existing) throw new ConflictException("Draft already exists; reload");
        const content = validateEvidenceUpdate({ documents: [] } as unknown as AdvanceEvidenceContent, input,
          target.frozen.stages[Number(index)].acceptanceCriteria);
        const [saved] = await tx.insert(schema.evidenceDrafts).values({ campaignMetadataId: id, milestoneIndex: index,
          organizerUserId: userId, evidenceSchemaVersion: "0.2", content }).returning();
        return saved;
      }
      const draft = await this.draft(tx, id, index, expectedRevision);
      const content = validateEvidenceUpdate(draft.content, input, target.frozen.stages[Number(index)].acceptanceCriteria);
      const [saved] = await tx.update(schema.evidenceDrafts).set({ content, revision: expectedRevision + 1, updatedAt: new Date() })
        .where(eq(schema.evidenceDrafts.id, draft.id)).returning();
      return saved;
    });
  }

  async upload(id: string, index: string, userId: string, expectedRevision: number, kind: AdvanceEvidenceContent["documents"][number]["kind"], file?: EvidenceUploadFile) {
    const objectId = randomUUID();
    let stored = false;
    try {
      return await this.db.transaction(async tx => {
        const target = await this.target(tx, id, index, userId); this.editable(target, index);
        await this.assertNoPreparedVersion(tx, id, index, target.stage.latestVersion);
        const draft = await this.draft(tx, id, index, expectedRevision);
        if (draft.content.documents.length >= 20) throw new BadRequestException("At most 20 evidence files");
        const mediaType = await validateEvidenceFile(file);
        const document: AdvanceEvidenceContent["documents"][number] = { documentId: objectId, storageObjectId: objectId,
          kind, originalName: file!.originalname.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200) || "document",
          mediaType, byteSize: file!.buffer.length, sha256: sha256(file!.buffer), visibility: "RESTRICTED_ORIGINAL",
          relatesToExpenseIds: [], relatesToCriterionIds: [] };
        await this.storage.put(objectId, file!.buffer, mediaType); stored = true;
        const [saved] = await tx.update(schema.evidenceDrafts).set({ content: { ...draft.content,
          documents: [...draft.content.documents, document] }, revision: expectedRevision + 1, updatedAt: new Date() })
          .where(eq(schema.evidenceDrafts.id, draft.id)).returning();
        return saved;
      });
    } catch (error) {
      if (stored) await this.storage.remove(objectId).catch(() => undefined);
      throw error;
    }
  }

  async freeze(id: string, index: string, userId: string, expectedRevision: number) {
    return this.db.transaction(async tx => {
      const target = await this.target(tx, id, index, userId); this.editable(target, index);
      const draft = await this.draft(tx, id, index, expectedRevision);
      const version = Number(target.stage.latestVersion) + 1;
      const [existing] = await tx.select().from(schema.evidencePackages).where(and(eq(schema.evidencePackages.campaignMetadataId, id),
        eq(schema.evidencePackages.milestoneIndex, index), eq(schema.evidencePackages.submissionVersion, version)));
      if (existing) {
        if (existing.draftRevision !== expectedRevision || sha256(existing.manifestBytes) !== existing.evidenceHash)
          throw new ConflictException("This version already has an immutable package; submit it before preparing another version");
        return existing;
      }
      const criteria = target.frozen.stages[Number(index)].acceptanceCriteria as { criterionId: string }[];
      if (!draft.content.documents.length || draft.content.report.outcomes.length !== criteria.length
        || criteria.some(c => !draft.content.report.outcomes.some(o => o.criterionId === c.criterionId)))
        throw new BadRequestException("Each frozen criterion requires a reported result; missing evidence can be declared for review");
      await this.storage.verifyPrivateBucket();
      for (const d of draft.content.documents) {
        const object = await this.storage.get(d.storageObjectId);
        if (!object.Body) throw new ServiceUnavailableException("Original evidence unavailable");
        const bytes = Buffer.from(await object.Body.transformToByteArray());
        if (bytes.length !== d.byteSize || sha256(bytes) !== d.sha256 || object.ContentType !== d.mediaType)
          throw new ConflictException("Original evidence bytes, size or MIME changed");
        await validateEvidenceFile({ buffer: bytes, mimetype: d.mediaType, originalname: d.originalName });
      }
      let parentPackageId: string | null = null;
      if (version > 1) {
        const previous = target.stage.submissions.find(v => v.version === String(version - 1));
        const [parent] = await tx.select().from(schema.evidencePackages).where(and(eq(schema.evidencePackages.campaignMetadataId, id),
          eq(schema.evidencePackages.milestoneIndex, index), eq(schema.evidencePackages.evidenceHash, previous!.evidenceHash)));
        if (!parent) throw new ConflictException("Canonical parent evidence package missing");
        parentPackageId = parent.id;
      }
      const packageId = randomUUID();
      const manifest = advanceEvidencePackageSchema.parse({ ...draft.content, schemaVersion: "0.2", packageId,
        context: this.chain.context, campaignMetadataId: id, campaignId: target.snapshot.campaignId, milestoneIndex: index,
        submissionVersion: version, organizerAddress: target.plan.organizer, planHash: target.plan.planHash,
        criteriaHash: target.plan.criteriaHashes[Number(index)], channel: target.frozen.channel,
        checklistVersion: "gift.v1", parentPackageId, createdAt: new Date().toISOString() });
      const manifestBytes = JSON.stringify(manifest);
      const fresh = await this.target(tx, id, index, userId); this.editable(fresh, index);
      if (fresh.stage.latestVersion !== target.stage.latestVersion || fresh.stage.submissionEnd !== target.stage.submissionEnd)
        throw new ConflictException("Evidence target changed during integrity checks");
      const [saved] = await tx.insert(schema.evidencePackages).values({ id: packageId, campaignMetadataId: id,
        milestoneIndex: index, organizerUserId: userId, submissionVersion: version,
        draftRevision: expectedRevision, manifestBytes, evidenceHash: sha256(manifestBytes) }).returning();
      return saved;
    });
  }

  private async package(tx: Tx, packageId: string, userId: string, manage: boolean) {
    const [row] = await tx.select().from(schema.evidencePackages).where(eq(schema.evidencePackages.id, packageId)).limit(1);
    if (!row) throw new NotFoundException("Evidence package not found");
    const target = await this.target(tx, row.campaignMetadataId, row.milestoneIndex, userId, manage);
    const ref = { campaignId: target.snapshot.campaignId, stage: row.milestoneIndex, version: String(row.submissionVersion), evidenceHash: row.evidenceHash };
    const checked = await this.reviews.checkedPackage(tx, packageId, row.campaignMetadataId, target.snapshot, ref);
    return { ...checked, target };
  }

  async original(packageId: string, userId: string, documentId?: string) {
    return this.db.transaction(async tx => {
      const p = await this.package(tx, packageId, userId, false);
      if (!documentId) return { manifestBytes: p.row.manifestBytes, evidenceHash: p.row.evidenceHash };
      const d = p.content.documents.find(d => d.documentId === documentId);
      if (!d) throw new NotFoundException("Original document not found");
      const object = await this.storage.get(d.storageObjectId);
      if (!object.Body) throw new ServiceUnavailableException("Original document unavailable");
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      if (sha256(bytes) !== d.sha256 || bytes.length !== d.byteSize || object.ContentType !== d.mediaType)
        throw new ConflictException("Original object differs from frozen evidence");
      await tx.insert(schema.evidenceAccessLog).values({ packageId, userId, documentId });
      return { document: d, bytes };
    });
  }

  async publication(packageId: string, userId: string) {
    return this.db.transaction(async tx => {
      const original = await this.package(tx, packageId, userId, false);
      const [row] = await tx.select().from(schema.evidencePublications).where(eq(schema.evidencePublications.packageId, packageId));
      if (!row) throw new NotFoundException("Redacted bundle has not been prepared");
      await this.reviews.checkedPublic(tx, packageId, row.hash, original);
      return row;
    });
  }

  async publishRedacted(packageId: string, userId: string, input: { summary: string; redactionConfirmed: boolean; originalDocumentIds: string[] }, files: EvidenceUploadFile[]) {
    const stored: string[] = [];
    try {
      return await this.db.transaction(async tx => {
        const p = await this.package(tx, packageId, userId, true);
        await tx.select().from(schema.evidencePackages).where(eq(schema.evidencePackages.id, packageId)).for("update");
        const [existing] = await tx.select().from(schema.evidencePublications).where(eq(schema.evidencePublications.packageId, packageId));
        if (existing) throw new ConflictException("Redacted publication is immutable");
        if (input.redactionConfirmed !== true || !input.summary?.trim() || input.originalDocumentIds.length !== files.length
          || files.length !== p.content.documents.length || files.length === 0 || files.length > 20
          || new Set(input.originalDocumentIds).size !== files.length) throw new BadRequestException("Confirm redaction and provide one separate file per original");
        const documents = [];
        for (let i = 0; i < files.length; i++) {
          const original = p.content.documents.find(d => d.documentId === input.originalDocumentIds[i]);
          if (!original) throw new BadRequestException("Public file refers to another original");
          const mediaType = await validateEvidenceFile(files[i]), documentId = randomUUID();
          if (sha256(files[i].buffer) === original.sha256) throw new BadRequestException("Public copy must be separately redacted; original bytes cannot be republished");
          const storageObjectId = `workflow-b/public/${documentId}`;
          await this.storage.put(storageObjectId, files[i].buffer, mediaType); stored.push(storageObjectId);
          documents.push({ documentId, originalDocumentId: original.documentId, originalSha256: original.sha256,
            storageObjectId, mediaType, byteSize: files[i].buffer.length, sha256: sha256(files[i].buffer) });
        }
        const o = p.content;
        const manifest = advancePublicManifestSchema.parse({ schemaVersion: "advance.public.v1", context: this.chain.context,
          packageId, evidenceHash: p.row.evidenceHash, planHash: o.planHash, criteriaHash: o.criteriaHash,
          campaignId: o.campaignId, milestoneIndex: o.milestoneIndex, submissionVersion: o.submissionVersion,
          summary: input.summary, redactionConfirmed: true, documents });
        const manifestBytes = JSON.stringify(manifest), hash = sha256(manifestBytes);
        const [saved] = await tx.insert(schema.evidencePublications).values({ packageId, hash, manifestBytes, createdBy: userId }).returning();
        await this.reviews.checkedPublic(tx, packageId, hash, p);
        return saved;
      });
    } catch (error) {
      await Promise.all(stored.map(id => this.storage.remove(id).catch(() => undefined)));
      throw error;
    }
  }

  async publicBundle(hash: string, documentId?: string) {
    return this.db.transaction(async tx => {
      const [row] = await tx.select().from(schema.evidencePublications).where(eq(schema.evidencePublications.hash, hash)).for("share");
      if (!row || sha256(row.manifestBytes) !== hash) throw new NotFoundException("Public evidence bundle not found");
      const parsed = advancePublicManifestSchema.safeParse(JSON.parse(row.manifestBytes));
      if (!parsed.success || JSON.stringify(parsed.data.context) !== JSON.stringify(this.chain.context)) throw new NotFoundException("B public evidence bundle not found");
      const p = parsed.data;
      await this.chain.verifyDeployment();
      const block = await this.chain.client.getBlock();
      const snapshot = await this.chain.snapshot(BigInt(p.campaignId), block.number);
      const submission = snapshot.stages[Number(p.milestoneIndex)]?.submissions.find(v => v.version === String(p.submissionVersion));
      if (!submission || submission.evidenceHash !== p.evidenceHash || snapshot.campaign.planHash !== p.planHash)
        throw new ConflictException("Evidence bundle is not submitted on the canonical B chain");
      if (!documentId) return { manifestBytes: row.manifestBytes, publicHash: hash };
      const d = p.documents.find(d => d.documentId === documentId);
      if (!d || d.storageObjectId !== `workflow-b/public/${d.documentId}`) throw new NotFoundException("Public document not found");
      const object = await this.storage.get(d.storageObjectId);
      if (!object.Body) throw new ServiceUnavailableException("Public document unavailable");
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      if (sha256(bytes) !== d.sha256 || bytes.length !== d.byteSize || object.ContentType !== d.mediaType)
        throw new ConflictException("Public object differs from committed bundle");
      return { document: d, bytes };
    });
  }
}
