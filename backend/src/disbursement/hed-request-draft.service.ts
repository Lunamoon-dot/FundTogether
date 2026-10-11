import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, hedCampaignDrafts, organizationMembers } from "../database/schema";
import { hedRequestDraftSchema } from "./hed-request-draft.schema";
import type { HedRequestDraftInput } from "./hed-request-draft.schema";

export const hedRequestHash = (campaignCommitmentHash: string, vendorReportHash: string, content: HedRequestDraftInput) => keccak256(toHex(JSON.stringify({
  version: "hed-mvp-1", campaignCommitmentHash, vendorReportHash, activityReference: content.activityReference,
  purpose: content.purpose, itemLines: content.itemLines, amount: content.amount, deposit: content.deposit,
  expectedDeliveryAt: content.expectedDeliveryAt, acceptanceCriteria: content.acceptanceCriteria, terms: content.terms,
  needEvidenceReferences: content.needEvidenceReferences,
})));

@Injectable()
export class HedRequestDraftService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>) {}

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

  async create(campaignId: string, userId: string, input: unknown) {
    const campaign = await this.campaign(campaignId, userId);
    const parsed = hedRequestDraftSchema.parse(input), vendor = await this.verifiedVendor(parsed.vendorVerificationId);
    return this.db.insert(schema.hedRequestDrafts).values({ campaignMetadataId: campaign.campaign.id, vendorVerificationId: vendor.id,
      content: parsed, createdBy: userId }).returning();
  }

  async freeze(campaignId: string, requestId: string, userId: string) {
    const campaign = await this.campaign(campaignId, userId);
    return this.db.transaction(async tx => {
      const [draft] = await tx.select().from(schema.hedRequestDrafts).where(and(eq(schema.hedRequestDrafts.id, requestId),
        eq(schema.hedRequestDrafts.campaignMetadataId, campaign.campaign.id))).for("update");
      if (!draft) throw new NotFoundException("HED request draft not found");
      if (draft.frozenAt) throw new ConflictException("HED request draft is already frozen");
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
