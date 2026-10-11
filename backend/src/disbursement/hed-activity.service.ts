import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { keccak256, toHex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { campaignMetadata, hedCampaignDrafts, organizationMembers } from "../database/schema";
import type { HedActivityInput } from "./hed-activity.schema";
import { HedBlockchainService } from "./hed-blockchain.service";

export const hedActivityHash = (campaignCommitmentHash: string, content: HedActivityInput) => keccak256(toHex(JSON.stringify({ version: "hed-mvp-1", campaignCommitmentHash, ...content })));

@Injectable()
export class HedActivityService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly chain: HedBlockchainService) {}

  private async campaign(campaignId: string, userId: string) {
    const [row] = await this.db.select({ campaign: campaignMetadata, draft: hedCampaignDrafts }).from(hedCampaignDrafts)
      .innerJoin(campaignMetadata, eq(campaignMetadata.id, hedCampaignDrafts.campaignMetadataId)).where(eq(campaignMetadata.id, campaignId)).limit(1);
    if (!row?.campaign.organizationId) throw new NotFoundException("HED campaign draft not found");
    const [member] = await this.db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, row.campaign.organizationId),
      eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER"))).limit(1);
    if (!member) throw new ForbiddenException("Organization OWNER membership required");
    if (!row.draft.frozenAt || !row.draft.commitmentHash) throw new ConflictException("Freeze the HED campaign before creating an activity");
    const [mapped] = await this.db.select().from(schema.disbursementCampaigns).where(eq(schema.disbursementCampaigns.campaignMetadataId, campaignId)).limit(1);
    if (!mapped?.onchainCampaignId || mapped.chainId !== this.chain.context.chainId || mapped.contractAddress !== this.chain.context.contractAddress.toLowerCase())
      throw new ConflictException("Publish and index the HED campaign before creating an activity");
    return { ...row, mapped };
  }

  async list(campaignId: string, userId: string) {
    await this.campaign(campaignId, userId);
    return this.db.select().from(schema.hedActivities).where(eq(schema.hedActivities.campaignMetadataId, campaignId)).orderBy(desc(schema.hedActivities.createdAt));
  }

  async create(campaignId: string, userId: string, content: HedActivityInput) {
    const campaign = await this.campaign(campaignId, userId);
    if (BigInt(content.ceiling) > BigInt(campaign.draft.goal) / 2n) throw new ConflictException("Activity ceiling exceeds the fixed 50% HED campaign cap");
    return this.db.insert(schema.hedActivities).values({ campaignMetadataId: campaignId, content, createdBy: userId }).returning();
  }

  async freeze(campaignId: string, activityId: string, userId: string) {
    const campaign = await this.campaign(campaignId, userId);
    const [activity] = await this.db.select().from(schema.hedActivities).where(and(eq(schema.hedActivities.id, activityId), eq(schema.hedActivities.campaignMetadataId, campaignId))).limit(1);
    if (!activity) throw new NotFoundException("HED activity not found");
    if (activity.frozenAt) throw new ConflictException("HED activity is already frozen");
    const commitmentHash = hedActivityHash(campaign.draft.commitmentHash!, activity.content);
    const [saved] = await this.db.update(schema.hedActivities).set({ commitmentHash, frozenAt: new Date() }).where(and(eq(schema.hedActivities.id, activityId), isNull(schema.hedActivities.frozenAt))).returning();
    if (!saved) throw new ConflictException("HED activity changed; reload before freezing");
    return saved;
  }

  async registerOnchain(campaignId: string, activityId: string, userId: string, onchainActivityId: string) {
    const campaign = await this.campaign(campaignId, userId);
    const [activity] = await this.db.select().from(schema.hedActivities).where(and(eq(schema.hedActivities.id, activityId), eq(schema.hedActivities.campaignMetadataId, campaignId))).limit(1);
    if (!activity?.frozenAt || !activity.commitmentHash) throw new ConflictException("Freeze the HED activity before registering its on-chain identity");
    const block = await this.chain.client.getBlock({ blockTag: "latest" });
    const snapshot = await this.chain.snapshot(BigInt(campaign.mapped.onchainCampaignId!), block.number);
    const onchain = snapshot.activities[Number(onchainActivityId)];
    if (!onchain || onchain.commitmentHash.toLowerCase() !== activity.commitmentHash.toLowerCase() || onchain.ceiling !== activity.content.ceiling)
      throw new ConflictException("On-chain activity does not match the frozen HED activity commitment and ceiling");
    await this.db.update(schema.hedActivities).set({ onchainActivityId }).where(and(eq(schema.hedActivities.id, activityId), isNull(schema.hedActivities.onchainActivityId)));
    const [saved] = await this.db.select().from(schema.hedActivities).where(eq(schema.hedActivities.id, activityId)).limit(1);
    if (!saved || saved.onchainActivityId !== onchainActivityId) throw new ConflictException("HED activity is already mapped to another on-chain identity");
    return saved;
  }
}
