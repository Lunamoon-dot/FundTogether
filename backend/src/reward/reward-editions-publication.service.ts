import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { chainEvents, editionsChainCampaigns, platformRoles, rewardCampaigns, rewardCreatorProfiles, rewardReviews, walletLinks } from "../database/schema";
import { editionsCommitment } from "./reward-editions-commitment";
import { RewardEditionsIndexerService } from "./reward-editions-indexer.service";

export function deriveEditionsPublication<TBinding extends { onchainCampaignId: string; canonical: boolean; snapshot: { state: number } },
  TEvent extends { transactionHash: string; args: Record<string, unknown>; canonical: boolean }>(bindings: TBinding[], createdEvents: TEvent[]) {
  const canonicalBindings = bindings.filter(binding => binding.canonical);
  const binding = canonicalBindings.length === 1 ? canonicalBindings[0] : undefined;
  const event = binding
    ? createdEvents.find(item => item.canonical && String(item.args.campaignId) === binding.onchainCampaignId)
    : createdEvents.find(item => bindings.some(candidate => String(item.args.campaignId) === candidate.onchainCampaignId));
  return {
    binding,
    publicationStatus: binding ? "ON_CHAIN_CONFIRMED" as const : bindings.length ? "ORPHANED" as const : "NOT_PUBLISHED" as const,
    bindingTransactionHash: event?.transactionHash ?? null,
  };
}

@Injectable()
export class RewardEditionsPublicationService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly indexer: RewardEditionsIndexerService) {}

  async canonicalCampaignStates(): Promise<Map<string, number>> {
    await this.indexer.runOnce();
    const bindings = await this.db.select({ campaignId: editionsChainCampaigns.campaignId, snapshot: editionsChainCampaigns.snapshot })
      .from(editionsChainCampaigns)
      .where(and(eq(editionsChainCampaigns.streamId, this.indexer.streamId()), eq(editionsChainCampaigns.canonical, true)));
    return new Map(bindings.map(item => [item.campaignId, item.snapshot.state]));
  }

  async operations(scope: "creator" | "resolver" | "admin", userId: string) {
    if (scope !== "creator") {
      const [role] = await this.db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
      const requiredRole = scope === "admin" ? "ADMIN" : "RESOLVER";
      if (!role?.roles.includes(requiredRole)) throw new ForbiddenException(`${requiredRole} required`);
    }

    await this.indexer.runOnce();
    const campaigns = await this.db.select({
      id: rewardCampaigns.id,
      title: rewardCampaigns.title,
      creatorUserId: rewardCampaigns.creatorUserId,
      applicationStatus: rewardCampaigns.status,
    }).from(rewardCampaigns).where(scope === "creator"
      ? and(eq(rewardCampaigns.category, "COMICS_ARTBOOK"), eq(rewardCampaigns.creatorUserId, userId))
      : eq(rewardCampaigns.category, "COMICS_ARTBOOK"));
    if (campaigns.length === 0) return [];

    const streamId = this.indexer.streamId();
    const [bindings, createdEvents] = await Promise.all([
      this.db.select().from(editionsChainCampaigns).where(eq(editionsChainCampaigns.streamId, streamId)),
      this.db.select().from(chainEvents).where(and(eq(chainEvents.streamId, streamId), eq(chainEvents.eventName, "CampaignCreated")))
        .orderBy(desc(chainEvents.blockNumber), desc(chainEvents.logIndex)),
    ]);

    return campaigns.map(campaign => {
      const campaignBindings = bindings.filter(binding => binding.campaignId === campaign.id);
      const publication = deriveEditionsPublication(campaignBindings, createdEvents);
      return {
        campaignId: campaign.id,
        title: campaign.title,
        creatorUserId: campaign.creatorUserId,
        applicationStatus: campaign.applicationStatus,
        publicationStatus: publication.publicationStatus,
        onchainCampaignId: publication.binding?.onchainCampaignId ?? null,
        contractState: publication.binding?.snapshot.state ?? null,
        snapshot: publication.binding?.snapshot ?? null,
        bindingTransactionHash: publication.bindingTransactionHash,
      };
    });
  }

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
    const onchainApproval = await this.indexer.isTermsApproved(frozen.payoutWallet.address, campaign.commitmentHash,
      BigInt(frozen.config.goal), BigInt(frozen.config.tiers[0].price), BigInt(frozen.config.fundingDuration), BigInt(releaseAt / 1000));
    return { deployment, creatorWallet: frozen.payoutWallet.address, commitmentHash: campaign.commitmentHash,
      goal: frozen.config.goal, price: frozen.config.tiers[0].price, fundingDuration: frozen.config.fundingDuration,
      releaseDeadline: String(releaseAt / 1000), chainTimestamp: now.toString(), onchainApproved: onchainApproval.approved };
  }

  async chainCampaign(id: string) {
    const [campaign] = await this.db.select().from(rewardCampaigns).where(and(eq(rewardCampaigns.id, id), eq(rewardCampaigns.status, "APPROVED")));
    if (!campaign?.frozenSnapshot || campaign.category !== "COMICS_ARTBOOK") throw new NotFoundException("Approved Editions campaign not found");
    const deployment = await this.indexer.deployment();
    await this.indexer.runOnce();
    const chainTimestamp = await this.indexer.chainTime();
    const bindings = await this.db.select().from(editionsChainCampaigns).where(and(eq(editionsChainCampaigns.campaignId, id), eq(editionsChainCampaigns.streamId, this.indexer.streamId())));
    const createdEvents = await this.db.select({ transactionHash: chainEvents.transactionHash, args: chainEvents.args, canonical: chainEvents.canonical })
      .from(chainEvents).where(and(eq(chainEvents.streamId, this.indexer.streamId()), eq(chainEvents.eventName, "CampaignCreated")))
      .orderBy(desc(chainEvents.blockNumber), desc(chainEvents.logIndex));
    const publication = deriveEditionsPublication(bindings, createdEvents);
    const binding = publication.binding;
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
    return { deployment, chainTimestamp: chainTimestamp.toString(), status: publication.publicationStatus,
      onchainCampaignId: binding?.onchainCampaignId ?? null, snapshot: binding?.snapshot ?? null,
      bindingTransactionHash: publication.bindingTransactionHash, challenges };
  }
}
