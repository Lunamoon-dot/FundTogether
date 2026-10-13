import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { chainEvents, editionsChainCampaigns, platformRoles, rewardCampaigns, rewardCreatorProfiles, rewardReviews, walletLinks } from "../database/schema";
import { editionsCommitment } from "./reward-editions-commitment";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";

@Injectable()
export class RewardEditionsPublicationService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly indexer: RewardEditionsIndexerService) {}

  async terms(id: string, userId: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(eq(rewardCampaigns.id, id));
    if (!campaign) throw new NotFoundException("Editions campaign not found");
    if (campaign.creatorUserId !== userId) {
      const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
      if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Creator or Resolver required");
    }
    const frozen = campaign.frozenSnapshot;
    if (campaign.category !== "COMICS_ARTBOOK" || campaign.status !== "APPROVED" || !frozen || !campaign.commitmentHash || editionsCommitment(frozen) !== campaign.commitmentHash)
      throw new ConflictException("An approved, intact Editions commitment is required");
    const [review] = await this.db.select().from(rewardReviews).where(and(eq(rewardReviews.campaignId, id),
      eq(rewardReviews.outcome, "APPROVED"), eq(rewardReviews.commitmentHash, campaign.commitmentHash)));
    if (!review?.frozenSnapshot || editionsCommitment(review.frozenSnapshot) !== campaign.commitmentHash || review.resolverUserId === campaign.creatorUserId)
      throw new ConflictException("An independent approval of the exact commitment is required");
    const [profile] = await this.db.select().from(rewardCreatorProfiles).where(eq(rewardCreatorProfiles.userId, campaign.creatorUserId));
    const [wallet] = await this.db.select().from(walletLinks).where(and(eq(walletLinks.id, frozen.payoutWallet.linkId), eq(walletLinks.userId, campaign.creatorUserId)));
    if (profile?.status !== "VERIFIED" || !wallet || wallet.address.toLowerCase() !== frozen.payoutWallet.address || wallet.chainId !== "31339")
      throw new ConflictException("Creator and frozen payout wallet must remain verified");
    const deployment = await this.indexer.deployment();
    const now = await this.indexer.chainTime();
    const releaseAt = new Date(frozen.preparation.releaseWindow.end).getTime();
    if (!Number.isSafeInteger(releaseAt) || releaseAt % 1000 !== 0 || BigInt(releaseAt / 1000) <= now + BigInt(frozen.config.fundingDuration))
      throw new ConflictException("Release deadline must be after the funding period on the current local chain clock");
    if (BigInt(frozen.config.tiers[0].price) > BigInt(frozen.config.goal)) throw new ConflictException("Standard price cannot exceed goal under the approved local policy");
    return { deployment, creatorWallet: frozen.payoutWallet.address, commitmentHash: campaign.commitmentHash,
      goal: frozen.config.goal, price: frozen.config.tiers[0].price, fundingDuration: frozen.config.fundingDuration,
      releaseDeadline: String(releaseAt / 1000), chainTimestamp: now.toString() };
  }

  async chainCampaign(id: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(and(eq(rewardCampaigns.id, id), eq(rewardCampaigns.status, "APPROVED")));
    if (!campaign?.frozenSnapshot || campaign.category !== "COMICS_ARTBOOK") throw new NotFoundException("Approved Editions campaign not found");
    const deployment = await this.indexer.deployment();
    await this.indexer.runOnce();
    const bindings = await this.db.select().from(editionsChainCampaigns).where(and(eq(editionsChainCampaigns.campaignId, id), eq(editionsChainCampaigns.streamId, this.indexer.streamId())));
    const binding = bindings.find(item => item.canonical);
    const challenges: { backer: string; evidenceHash: string; resolved: boolean; upheld: boolean | null; decisionHash: string | null }[] = [];
    if (binding) {
      const events = await this.db.select().from(chainEvents).where(and(eq(chainEvents.streamId, this.indexer.streamId()), eq(chainEvents.canonical, true)))
        .orderBy(asc(chainEvents.blockNumber), asc(chainEvents.logIndex));
      for (const event of events) {
        const args = event.args as Record<string, unknown>;
        if (String(args.campaignId) !== binding.onchainCampaignId) continue;
        if (event.eventName === "ReleaseChallenged") challenges.push({ backer: String(args.backer).toLowerCase(), evidenceHash: String(args.evidenceHash), resolved: false, upheld: null, decisionHash: null });
        if (event.eventName === "ChallengeResolved") {
          const challenge = challenges.find(item => item.backer === String(args.backer).toLowerCase());
          if (challenge) Object.assign(challenge, { resolved: true, upheld: args.upheld === true, decisionHash: String(args.decisionHash) });
        }
      }
    }
    return { deployment, status: binding ? "ON_CHAIN_CONFIRMED" : bindings.length ? "ORPHANED" : "NOT_PUBLISHED",
      onchainCampaignId: binding?.onchainCampaignId ?? null, snapshot: binding?.snapshot ?? null, challenges };
  }
}
