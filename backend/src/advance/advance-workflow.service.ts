import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Address } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { AdvanceIndexerService, matchingAdvancePlan } from "./advance-indexer.service";
import { AdvanceReviewService } from "./advance-review.service";
import { advanceActionSchema } from "./advance-workflow.schema";
import { actionTransaction } from "./advance-action-policy";
import { restoreGiftPlan, sha256 } from "./advance-plan";
import type { AdvanceActionPreparation, AdvanceCampaignSnapshot, AdvanceWorkflow } from "./advance.types";
type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export function workflowFromSnapshot(s: AdvanceCampaignSnapshot): AdvanceWorkflow {
  const c = s.campaign, stage = s.stages[Number(c.currentStage)];
  const cs = stage.submissions.find(v => v.version === stage.latestVersion)?.challengeCase;
  return { context: s.context, checkpoint: s.checkpoint, campaignId: s.campaignId, currentStage: c.currentStage,
    state: c.state, stageState: stage.state, goal: c.goal, contributed: c.contributed, advanced: c.advanced,
    returned: c.returned, refunded: c.refunded, custody: c.custody, basePool: c.basePool, supplementPool: c.supplementPool,
    deadlines: { fundingEnd: c.fundingEnd, firstReviewEnd: c.firstReviewEnd, claimEnd: c.claimEnd,
      submissionEnd: stage.submissionEnd, reviewEnd: stage.reviewEnd, challengeEnd: stage.challengeEnd,
      responseEnd: cs?.responseEnd ?? "0", resolutionEnd: cs?.resolutionEnd ?? "0", finalizeEnd: stage.finalizeEnd, hardStop: stage.hardStop } };
}

@Injectable()
export class AdvanceWorkflowService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, private readonly chain: AdvanceBlockchainService,
    private readonly indexer: AdvanceIndexerService, private readonly reviews: AdvanceReviewService) {}

  private async ready() {
    const status = await this.indexer.status();
    if (status.status !== "ready") throw new ServiceUnavailableException({ code: "INDEXER_NOT_READY", message: "B indexer is catching up or recovering", indexer: status });
    return status;
  }
  private async bound(tx: Tx, id: string) {
    const [row] = await tx.select({ campaign: schema.campaignMetadata, plan: schema.advanceCampaignPlans }).from(schema.advanceCampaignPlans)
      .innerJoin(schema.campaignMetadata, eq(schema.advanceCampaignPlans.campaignMetadataId, schema.campaignMetadata.id))
      .where(and(eq(schema.advanceCampaignPlans.campaignMetadataId, id), eq(schema.advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
        eq(schema.advanceCampaignPlans.chainId, this.chain.context.chainId), eq(schema.advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase()))).for("share");
    if (!row?.campaign.organizationId || !row.plan.frozenAt) throw new NotFoundException("Frozen B campaign not found");
    const plan = restoreGiftPlan(row.plan, this.chain.deployment);
    return { ...row, submission: plan };
  }
  private async owner(tx: Tx, organizationId: string, userId: string) {
    const [row] = await tx.select().from(schema.organizationMembers).where(and(eq(schema.organizationMembers.organizationId, organizationId),
      eq(schema.organizationMembers.userId, userId), eq(schema.organizationMembers.role, "OWNER"))).for("share");
    return Boolean(row);
  }
  private async linked(tx: Tx, userId: string, wallet: string) {
    const [row] = await tx.select().from(schema.walletLinks).where(and(eq(schema.walletLinks.userId, userId), eq(schema.walletLinks.chainId, "31338"),
      eq(schema.walletLinks.address, wallet.toLowerCase()))).for("share");
    if (!row) throw new ForbiddenException("Selected wallet must be SIWE-linked to the current account on31338");
  }

  async campaign(id: string, userId: string) {
    await this.chain.verifyDeployment();
    return this.db.transaction(async tx => {
      const row = await this.bound(tx, id);
      const owner = await this.owner(tx, row.campaign.organizationId!, userId);
      const [role] = await tx.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).for("share");
      if (!owner && !role?.roles.includes("RESOLVER")) throw new ForbiddenException("OWNER or reviewer access required");
      const block = await this.chain.client.getBlock();
      const mapped = await this.chain.read("campaignForDraft", [row.submission.organizer, row.submission.draftKey], block.number) as bigint;
      if (!owner && mapped === 0n) throw new ForbiddenException("Unsubmitted plans are private to the organization");
      const snapshot = mapped === 0n ? null : await this.chain.snapshot(mapped - 1n, block.number);
      if (snapshot && !matchingAdvancePlan(row.submission, snapshot)) throw new ConflictException("On-chain plan differs from frozen campaign");
      const packages = await tx.select({ id: schema.evidencePackages.id, milestoneIndex: schema.evidencePackages.milestoneIndex,
        submissionVersion: schema.evidencePackages.submissionVersion, draftRevision: schema.evidencePackages.draftRevision, evidenceHash: schema.evidencePackages.evidenceHash })
        .from(schema.evidencePackages).where(eq(schema.evidencePackages.campaignMetadataId, id));
      let reviewBlockedReason: string | null = snapshot ? null : "Campaign must be submitted before review";
      if (snapshot) {
        if (row.campaign.createdByUserId === userId || owner) reviewBlockedReason = "Organization OWNER or campaign creator cannot review own campaign";
        else {
          try { await this.reviews.assertReviewer(tx, row.campaign.organizationId!, userId, this.chain.context.resolver, snapshot.campaignId, block.number); }
          catch (cause) {
            if (!(cause instanceof ForbiddenException)) throw cause;
            reviewBlockedReason = cause.message;
          }
        }
      }
      return { metadataId: id, organizationId: row.campaign.organizationId, title: row.campaign.title,
        plan: row.submission, snapshot, workflow: snapshot ? workflowFromSnapshot(snapshot) : null, packages,
        reviewAccess: { canSign: reviewBlockedReason === null, blockedReason: reviewBlockedReason, requiredWallet: this.chain.context.resolver },
        checkpoint: snapshot?.checkpoint ?? { blockNumber: block.number.toString(), blockHash: block.hash, chainTimestamp: block.timestamp.toString() },
        indexer: await this.indexer.status() };
    });
  }

  async publicCampaigns() {
    await this.ready();
    const rows = await this.db.select({ projection: schema.advanceCampaignProjection, title: schema.campaignMetadata.title,
      description: schema.campaignMetadata.description }).from(schema.advanceCampaignProjection)
      .leftJoin(schema.campaignMetadata, eq(schema.advanceCampaignProjection.metadataId, schema.campaignMetadata.id))
      .where(and(eq(schema.advanceCampaignProjection.streamId, this.indexer.streamKey), sql`${schema.advanceCampaignProjection.snapshot}->>'published' = 'true'`));
    return { context: this.chain.context, items: rows.map(r => ({ metadataId: r.projection.metadataId,
      campaignId: r.projection.onchainCampaignId, title: r.title ?? "On-chain gift campaign", description: r.description,
      workflow: workflowFromSnapshot(r.projection.snapshot) })) };
  }

  async publicCampaign(id: string) {
    if (!/^(0|[1-9]\d{0,77})$/.test(id)) throw new BadRequestException("Invalid campaign ID");
    await this.ready();
    const [row] = await this.db.select({ projection: schema.advanceCampaignProjection, title: schema.campaignMetadata.title,
      description: schema.campaignMetadata.description }).from(schema.advanceCampaignProjection)
      .leftJoin(schema.campaignMetadata, eq(schema.advanceCampaignProjection.metadataId, schema.campaignMetadata.id))
      .where(and(eq(schema.advanceCampaignProjection.streamId, this.indexer.streamKey), eq(schema.advanceCampaignProjection.onchainCampaignId, id))).limit(1);
    if (!row?.projection.snapshot.published) throw new NotFoundException("Published B campaign not found");
    let plan: unknown = null;
    if (row.projection.metadataId) {
      const [stored] = await this.db.select().from(schema.advanceCampaignPlans).where(eq(schema.advanceCampaignPlans.campaignMetadataId, row.projection.metadataId));
      if (stored) {
        const restored = restoreGiftPlan(stored, this.chain.deployment), p = JSON.parse(restored.planBytes);
        plan = { activityType: p.activityType, channel: p.channel, recipientScope: p.recipientScope,
          eligibilityBasis: p.eligibilityBasis, checklistVersion: p.checklistVersion, stages: p.stages };
      }
    }
    return { metadataId: row.projection.metadataId, title: row.title, description: row.description, plan,
      snapshot: row.projection.snapshot, workflow: workflowFromSnapshot(row.projection.snapshot) };
  }

  async publicRecord(hash: string) {
    if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new BadRequestException("Invalid record hash");
    await this.ready();
    const [event] = await this.db.select().from(schema.chainEvents).where(and(eq(schema.chainEvents.streamId, this.indexer.streamKey),
      eq(schema.chainEvents.canonical, true), sql`(${schema.chainEvents.args}->>'reportHash' = ${hash}
        or ${schema.chainEvents.args}->>'reasonHash' = ${hash} or ${schema.chainEvents.args}->>'resolutionReasonHash' = ${hash}
        or ${schema.chainEvents.args}->>'materialHash' = ${hash} or ${schema.chainEvents.args}->>'responseHash' = ${hash})`)).limit(1);
    const [record] = await this.db.select().from(schema.milestoneRecords).where(eq(schema.milestoneRecords.hash, hash)).limit(1);
    if (!event || !record || sha256(record.recordBytes) !== hash) throw new NotFoundException("Canonical public record not found");
    const content = JSON.parse(record.recordBytes);
    if (JSON.stringify(content.context) !== JSON.stringify(this.chain.context)
      || !(content.review?.publicDisclosureConfirmed || content.statement?.publicDisclosureConfirmed))
      throw new NotFoundException("Record is not a disclosed B report");
    return { recordHash: hash, recordBytes: record.recordBytes, transactionHash: event.transactionHash, blockHash: event.blockHash };
  }

  async publicEvents(id: string) {
    const detail = await this.publicCampaign(id);
    const events = await this.db.select({ transactionHash: schema.chainEvents.transactionHash, logIndex: schema.chainEvents.logIndex,
      blockNumber: schema.chainEvents.blockNumber, blockHash: schema.chainEvents.blockHash,
      eventName: schema.chainEvents.eventName, args: schema.chainEvents.args }).from(schema.chainEvents)
      .where(and(eq(schema.chainEvents.streamId, this.indexer.streamKey), eq(schema.chainEvents.canonical, true),
        sql`${schema.chainEvents.args}->>'campaignId' = ${id}`))
      .orderBy(asc(schema.chainEvents.blockNumber), asc(schema.chainEvents.logIndex));
    return { context: this.chain.context, campaignId: id, checkpoint: detail.snapshot.checkpoint, events };
  }

  async refunds(userId: string, campaignId?: string) {
    if (campaignId !== undefined && !/^(0|[1-9]\d{0,77})$/.test(campaignId)) throw new BadRequestException("Invalid campaign ID");
    await this.ready();
    const wallets = await this.db.select().from(schema.walletLinks).where(and(eq(schema.walletLinks.userId, userId), eq(schema.walletLinks.chainId, "31338")));
    const rows = await this.db.select().from(schema.advanceCampaignProjection).where(and(eq(schema.advanceCampaignProjection.streamId, this.indexer.streamKey),
      campaignId === undefined ? undefined : eq(schema.advanceCampaignProjection.onchainCampaignId, campaignId)));
    const block = await this.chain.client.getBlock();
    const items = [];
    for (const row of rows) for (const wallet of wallets) {
      const id = BigInt(row.onchainCampaignId);
      const contribution = await this.chain.read("contributions", [id, wallet.address], block.number) as bigint;
      if (contribution === 0n) continue;
      const [base, supplement, baseConsumed, supplementPaid] = await this.chain.read("refundClaimable", [id, wallet.address], block.number) as [bigint, bigint, boolean, bigint];
      const snapshot = await this.chain.snapshot(id, block.number);
      items.push({ campaignId: id.toString(), metadataId: row.metadataId, wallet: wallet.address, contribution: contribution.toString(),
        base: base.toString(), supplement: supplement.toString(), baseConsumed, supplementPaid: supplementPaid.toString(),
        basePool: snapshot.campaign.basePool, supplementPool: snapshot.campaign.supplementPool,
        claimable: snapshot.campaign.refundSnapshotted && (!baseConsumed || base + supplement > 0n), checkpoint: snapshot.checkpoint });
    }
    return { context: this.chain.context, items };
  }

  async prepare(id: string, userId: string, input: unknown): Promise<AdvanceActionPreparation & { approval?: { tokenAddress: Address; spender: Address; amount: string; allowance: string } }> {
    const parsed = advanceActionSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const request = parsed.data;
    if (JSON.stringify(request.context) !== JSON.stringify(this.chain.context)) throw new ConflictException("Wrong B deployment context");
    await this.chain.verifyDeployment();
    const previous = await this.chain.client.getBlock({ blockNumber: BigInt(request.expectedCheckpoint.blockNumber) });
    if (previous.hash !== request.expectedCheckpoint.blockHash || previous.timestamp.toString() !== request.expectedCheckpoint.chainTimestamp)
      throw new ConflictException("Action checkpoint is no longer canonical");
    const reviewKinds = { APPROVE_CAMPAIGN: "APPROVE_CAMPAIGN", CONFIRM_FIRST_ADVANCE: "FIRST_ELIGIBILITY", STOP_CAMPAIGN: "STOP",
      APPROVE_EVIDENCE: "EVIDENCE", REQUEST_SUPPLEMENT: "EVIDENCE", REJECT_EVIDENCE: "EVIDENCE", RESOLVE_CASE: "CASE" } as const;
    if (request.action in reviewKinds) {
      const review = request.review;
      if (!review || review.kind !== reviewKinds[request.action as keyof typeof reviewKinds] || review.actorWallet.toLowerCase() !== request.actorWallet.toLowerCase()
        || review.expectedPlanHash !== request.expectedPlanHash || (request.action === "APPROVE_EVIDENCE" && review.decision?.outcome !== "MET")
        || (request.action === "REJECT_EVIDENCE" && review.decision?.outcome !== "NOT_MET")
        || (request.action === "REQUEST_SUPPLEMENT" && !["NEEDS_INFORMATION", "INCONCLUSIVE"].includes(review.decision?.outcome ?? "")))
        throw new BadRequestException("Review intent must match the selected action, actor and plan");
      await this.ready();
      const current = await this.campaign(id, userId);
      if (current.snapshot?.campaign.state !== request.expectedState || current.snapshot?.campaign.currentStage !== request.expectedCurrentStage)
        throw new ConflictException("Review state changed; reload");
      return this.reviews.prepareReview(id, userId, review);
    }
    if (request.action !== "SUBMIT_CAMPAIGN") await this.ready();
    return this.db.transaction(async tx => {
      const row = await this.bound(tx, id), plan = row.submission;
      await this.linked(tx, userId, request.actorWallet);
      const owns = await this.owner(tx, row.campaign.organizationId!, userId);
      const organizer = owns && plan.organizer.toLowerCase() === request.actorWallet.toLowerCase();
      const block = await this.chain.client.getBlock();
      const checkpoint = { blockNumber: block.number.toString(), blockHash: block.hash!, chainTimestamp: block.timestamp.toString() };
      const mapped = await this.chain.read("campaignForDraft", [plan.organizer, plan.draftKey], block.number) as bigint;
      const base = { context: this.chain.context, checkpoint, actorWallet: request.actorWallet as Address,
        contractAddress: this.chain.context.contractAddress, recordHash: null, blockedReason: null };
      if (request.expectedPlanHash !== plan.planHash) throw new ConflictException("Frozen plan changed");
      if (request.action === "SUBMIT_CAMPAIGN") {
        if (!organizer) throw new ForbiddenException("Linked representative and OWNER required");
        if (mapped !== 0n || request.expectedState !== "UNSUBMITTED" || request.expectedCurrentStage !== "0") throw new ConflictException("Campaign already submitted or state changed");
        return { ...base, functionName: "submitCampaignForDraft", args: [plan.draftKey, plan.planHash, plan.fundingDuration, plan.budgets, plan.criteriaHashes] };
      }
      if (mapped === 0n) throw new ConflictException("Campaign has not been submitted");
      const snapshot = await this.chain.snapshot(mapped - 1n, block.number);
      if (!matchingAdvancePlan(plan, snapshot)) throw new ConflictException("On-chain campaign differs from frozen plan");
      const contribution = await this.chain.read("contributions", [mapped - 1n, request.actorWallet], block.number) as bigint;
      const [refundBase, supplement, baseConsumed] = await this.chain.read("refundClaimable", [mapped - 1n, request.actorWallet], block.number) as [bigint, bigint, boolean, bigint];
      const isResolverWallet = request.actorWallet.toLowerCase() === this.chain.context.resolver.toLowerCase();
      if (isResolverWallet && request.action === "OPEN_CASE") {
        const [role] = await tx.select().from(schema.platformRoles).where(eq(schema.platformRoles.userId, userId)).for("share");
        if (!role?.roles.includes("RESOLVER")) throw new ForbiddenException("Current RESOLVER account role required");
      }
      let packageHash: string | null = null;
      if (request.action === "SUBMIT_EVIDENCE") {
        if (!organizer || !request.packageId) throw new ForbiddenException("Owner's frozen evidence package required");
        const [packageRow] = await tx.select().from(schema.evidencePackages).where(eq(schema.evidencePackages.id, request.packageId)).for("share");
        if (!packageRow) throw new NotFoundException("Evidence package not found");
        const ref = { campaignId: snapshot.campaignId, stage: snapshot.campaign.currentStage,
          version: (BigInt(snapshot.stages[Number(snapshot.campaign.currentStage)].latestVersion) + 1n).toString(), evidenceHash: packageRow.evidenceHash };
        await this.reviews.checkedPackage(tx, request.packageId, id, snapshot, ref);
        packageHash = packageRow.evidenceHash;
      }
      let recordBytes: string | null = null;
      if (["OPEN_CASE", "ADD_CASE_MATERIAL", "SUBMIT_CASE_RESPONSE"].includes(request.action)) {
        if (!request.statement) throw new BadRequestException("Public case statement with sources and limits required");
        recordBytes = JSON.stringify({ schemaVersion: "advance.case-record.v1", context: this.chain.context, checkpoint,
          campaignMetadataId: id, campaignId: snapshot.campaignId, actorWallet: request.actorWallet.toLowerCase(),
          action: request.action, evidenceRef: request.evidenceRef, statement: request.statement });
      }
      const recordHash = recordBytes ? sha256(recordBytes) : null;
      const action = actionTransaction(snapshot, request, { organizer, resolver: isResolverWallet,
        contribution: contribution.toString(), base: refundBase.toString(), supplement: supplement.toString(), baseConsumed }, recordHash, packageHash);
      let approval: { tokenAddress: Address; spender: Address; amount: string; allowance: string } | undefined;
      if (["DONATE", "RETURN_FUNDS"].includes(request.action)) {
        const abi = require("../blockchain/generated/advance/mock-usdc.abi.json");
        const [balance, allowance] = await Promise.all([
          this.chain.client.readContract({ address: this.chain.context.tokenAddress, abi, functionName: "balanceOf", args: [request.actorWallet], blockNumber: block.number }),
          this.chain.client.readContract({ address: this.chain.context.tokenAddress, abi, functionName: "allowance", args: [request.actorWallet, this.chain.context.contractAddress], blockNumber: block.number }),
        ]) as [bigint, bigint];
        if (balance < BigInt(request.amount!)) throw new ConflictException("Selected wallet has insufficient configured token balance");
        if (allowance < BigInt(request.amount!)) approval = { tokenAddress: this.chain.context.tokenAddress, spender: this.chain.context.contractAddress,
          amount: request.amount!, allowance: allowance.toString() };
      }
      await this.chain.verifyDeployment();
      if ((await this.chain.client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new ConflictException("Action checkpoint orphaned");
      if (recordBytes) await tx.insert(schema.milestoneRecords).values({ hash: recordHash!, recordBytes, createdBy: userId }).onConflictDoNothing();
      return { ...base, ...action, recordHash, ...(approval ? { approval } : {}) };
    });
  }
}
