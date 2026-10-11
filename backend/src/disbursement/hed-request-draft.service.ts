import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, hedCampaignDrafts, organizationMembers } from "../database/schema";
import { hedRequestDraftSchema, hedRequestHash } from "./hed-request-draft.schema";
import type { HedRequestDraftInput } from "./hed-request-draft.schema";
import { EvidenceStorageService } from "../modules/evidence/evidence-storage.service";
import { validateEvidenceFile } from "../modules/evidence/evidence-file-validation";
import type { EvidenceUploadFile } from "../modules/evidence/evidence-file-validation";
import { HedBlockchainService } from "./hed-blockchain.service";

@Injectable()
export class HedRequestDraftService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly storage: EvidenceStorageService, private readonly chain: HedBlockchainService) {}

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
    const rows = await this.db.select({ draft: schema.hedRequestDrafts, onchainRequestId: schema.disbursementRequests.onchainRequestId }).from(schema.hedRequestDrafts)
      .leftJoin(schema.disbursementRequests, eq(schema.disbursementRequests.requestDraftId, schema.hedRequestDrafts.id)).where(eq(schema.hedRequestDrafts.campaignMetadataId, campaignId))
      .orderBy(desc(schema.hedRequestDrafts.createdAt));
    return rows.map(({ draft, onchainRequestId }) => ({ ...draft, onchainRequestId }));
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
    const [mapped] = await this.db.select().from(schema.disbursementCampaigns).where(eq(schema.disbursementCampaigns.campaignMetadataId, campaign.campaign.id)).limit(1);
    if (!mapped?.onchainCampaignId || mapped.chainId !== this.chain.context.chainId || mapped.contractAddress !== this.chain.context.contractAddress.toLowerCase())
      throw new ConflictException("Publish and index the HED campaign before creating a payment request");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    if ((await this.chain.snapshot(BigInt(mapped.onchainCampaignId), block.number)).campaign.state !== "ACTIVE")
      throw new ConflictException("HED payment requests open only after the campaign is ACTIVE on chain");
    const parsed = hedRequestDraftSchema.parse(input), vendor = await this.verifiedVendor(parsed.vendorVerificationId);
    const [activity] = await this.db.select().from(schema.hedActivities).where(and(eq(schema.hedActivities.id, parsed.activityId),
      eq(schema.hedActivities.campaignMetadataId, campaign.campaign.id))).limit(1);
    if (!activity?.frozenAt || !activity.commitmentHash || !activity.onchainActivityId)
      throw new ConflictException("Freeze and publish the HED activity before creating a payment request");
    return this.db.insert(schema.hedRequestDrafts).values({ campaignMetadataId: campaign.campaign.id, activityId: activity.id, vendorVerificationId: vendor.id,
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
      if (!draft.activityId) throw new ConflictException("Legacy HED request draft has no frozen activity");
      const [activity] = await tx.select().from(schema.hedActivities).where(eq(schema.hedActivities.id, draft.activityId)).for("share");
      if (!activity?.commitmentHash || !activity.frozenAt || !activity.onchainActivityId)
        throw new ConflictException("HED activity is not a frozen on-chain activity");
      const requestHash = hedRequestHash(campaign.draft.commitmentHash!, activity.commitmentHash, vendor.reportHash, draft.content);
      const [saved] = await tx.update(schema.hedRequestDrafts).set({ requestHash, frozenAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.hedRequestDrafts.id, draft.id), isNull(schema.hedRequestDrafts.frozenAt))).returning();
      if (!saved) throw new ConflictException("HED request changed; reload before freezing");
      return saved;
    });
  }

  async registerOnchain(campaignId: string, requestId: string, userId: string, onchainRequestId: string) {
    const campaign = await this.campaign(campaignId, userId);
    const [mappedCampaign] = await this.db.select().from(schema.disbursementCampaigns)
      .where(eq(schema.disbursementCampaigns.campaignMetadataId, campaignId)).limit(1);
    if (!mappedCampaign?.onchainCampaignId) throw new ConflictException("HED campaign is not mapped on chain");
    const [draft] = await this.db.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, requestId),
      eq(schema.hedRequestDrafts.campaignMetadataId, campaignId))).limit(1);
    if (!draft?.frozenAt || !draft.requestHash || !draft.activityId) throw new ConflictException("Freeze the HED request before registering its on-chain identity");
    const [activity, vendor] = await Promise.all([
      this.db.select().from(schema.hedActivities).where(eq(schema.hedActivities.id, draft.activityId)).limit(1).then(rows => rows[0]),
      this.db.select().from(schema.hedVendorVerifications).where(eq(schema.hedVendorVerifications.id, draft.vendorVerificationId)).limit(1).then(rows => rows[0]),
    ]);
    if (!activity?.onchainActivityId || !vendor) throw new ConflictException("HED request activity or vendor verification is not valid");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(mappedCampaign.onchainCampaignId), block.number);
    const onchain = snapshot.requests[Number(onchainRequestId)];
    if (!onchain || onchain.requestHash.toLowerCase() !== draft.requestHash.toLowerCase()
      || onchain.activityId !== activity.onchainActivityId || onchain.vendor.toLowerCase() !== vendor.vendorWallet.toLowerCase()
      || onchain.approvedAmount !== draft.content.amount || onchain.depositAmount !== draft.content.deposit)
      throw new ConflictException("On-chain request does not match the frozen HED request, activity, vendor, amount, and deposit");
    await this.db.insert(schema.disbursementRequests).values({ campaignMetadataId: campaign.campaign.id, requestDraftId: draft.id,
      onchainRequestId, requestVersion: draft.version, requestHash: draft.requestHash, vendorWallet: vendor.vendorWallet,
      amount: draft.content.amount, deposit: draft.content.deposit, frozenAt: draft.frozenAt }).onConflictDoNothing();
    const [saved] = await this.db.select().from(schema.disbursementRequests).where(eq(schema.disbursementRequests.requestDraftId, draft.id)).limit(1);
    if (!saved || saved.onchainRequestId !== onchainRequestId) throw new ConflictException("HED request is already mapped to another on-chain identity");
    return { requestId, onchainRequestId, checkpoint: snapshot.checkpoint };
  }
}
