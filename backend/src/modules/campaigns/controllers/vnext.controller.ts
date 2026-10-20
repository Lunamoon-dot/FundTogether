import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../../database/schema";
import { DRIZZLE_DB } from "../../../database/database.constants";
import {
  vnextCampaignProjections,
  vnextChainEvents,
  vnextBackerProjections,
  vnextChallengeProjections,
  vnextJudgeAssignments,
  vnextJudgeLedgerProjections,
  vnextMilestoneProjections,
  vnextReviewProjections,
} from "../../../database/schema";
import { AuthGuard } from "../../auth/auth.guard";
import { VNEXT_CONNECTION, type VNextConnection } from "../../../indexer/vnext-indexer.service";
import {
  buildVNextTransactionStatus,
  normalizeVNextTransactionHash,
} from "../../../indexer/vnext-transaction-status";

@Controller("v1/fundtogether/vnext")
export class VNextController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(VNEXT_CONNECTION) private readonly connection: VNextConnection | null,
  ) {}

  @Get("deployment")
  deployment() {
    if (!this.connection) return { configured: false };
    const { manifest } = this.connection;
    return {
      configured: true,
      protocolKind: manifest.protocolKind,
      chainId: manifest.chainId,
      rpcUrl: manifest.rpcUrl,
      abiVersion: manifest.abiVersion,
      abiHash: manifest.abiHash,
      policyHash: manifest.policyHash,
      tokenDecimals: manifest.tokenDecimals,
      confirmations: manifest.confirmations,
      campaignEscrow: manifest.campaignEscrow,
      juryRegistry: manifest.juryRegistry,
      juryReview: manifest.juryReview,
      randomnessProvider: manifest.randomnessProvider,
      tokenAddress: manifest.tokenAddress,
      genesisHash: manifest.genesisHash,
      campaignCodeHash: manifest.campaignCodeHash,
      registryCodeHash: manifest.registryCodeHash,
      reviewCodeHash: manifest.reviewCodeHash,
      tokenCodeHash: manifest.tokenCodeHash,
      deploymentBlockNumber: manifest.deploymentBlockNumber,
      deploymentBlockHash: manifest.deploymentBlockHash,
    };
  }

  @Get("transactions/:transactionHash")
  async transaction(@Param("transactionHash") transactionHash: string) {
    if (!this.connection) throw new NotFoundException("VNext deployment is not configured");
    let normalizedHash: `0x${string}`;
    try {
      normalizedHash = normalizeVNextTransactionHash(transactionHash);
    } catch {
      throw new BadRequestException("Invalid VNext transaction hash");
    }
    const events = await this.db.select({ eventName: vnextChainEvents.eventName }).from(vnextChainEvents).where(
      and(
        eq(vnextChainEvents.streamId, this.streamId()),
        eq(vnextChainEvents.transactionHash, normalizedHash),
        eq(vnextChainEvents.canonical, true),
      ),
    );
    return buildVNextTransactionStatus(normalizedHash, events);
  }

  @Get("campaigns/:campaignId")
  async campaign(@Param("campaignId") campaignId: string) {
    const [projection] = await this.db.select().from(vnextCampaignProjections).where(
      and(eq(vnextCampaignProjections.streamId, this.streamId()), eq(vnextCampaignProjections.onchainCampaignId, campaignId)),
    );
    if (!projection) throw new NotFoundException("VNext campaign projection not found");
    return projection;
  }

  @Get("campaigns/:campaignId/milestones")
  async milestones(@Param("campaignId") campaignId: string) {
    return this.db.select().from(vnextMilestoneProjections).where(
      and(eq(vnextMilestoneProjections.streamId, this.streamId()), eq(vnextMilestoneProjections.onchainCampaignId, campaignId)),
    );
  }

  @Get("campaigns/:campaignId/backer")
  @UseGuards(AuthGuard)
  async backerPosition(@Param("campaignId") campaignId: string, @Req() request: Request) {
    const walletAddresses = (request.account?.wallets ?? [])
      .filter(wallet => wallet.chainId === 31339)
      .map(wallet => wallet.address.toLowerCase());
    if (walletAddresses.length === 0) return [];
    return this.db.select().from(vnextBackerProjections).where(and(
      eq(vnextBackerProjections.streamId, this.streamId()),
      eq(vnextBackerProjections.onchainCampaignId, campaignId),
      inArray(vnextBackerProjections.backerAddress, walletAddresses),
    ));
  }

  @Get("campaigns/:campaignId/challenges")
  async challenges(@Param("campaignId") campaignId: string) {
    return this.db.select().from(vnextChallengeProjections).where(and(
      eq(vnextChallengeProjections.streamId, this.streamId()),
      eq(vnextChallengeProjections.onchainCampaignId, campaignId),
    ));
  }

  @Get("judge-ledger")
  @UseGuards(AuthGuard)
  async judgeLedger(@Req() request: Request) {
    const walletAddresses = (request.account?.wallets ?? [])
      .filter(wallet => wallet.chainId === 31339)
      .map(wallet => wallet.address.toLowerCase());
    if (walletAddresses.length === 0) return [];
    return this.db.select().from(vnextJudgeLedgerProjections).where(and(
      eq(vnextJudgeLedgerProjections.streamId, this.streamId()),
      inArray(vnextJudgeLedgerProjections.judgeAddress, walletAddresses),
    ));
  }

  @Get("reviews")
  async reviews() {
    const streamId = this.streamId();
    const [reviews, assignments] = await Promise.all([
      this.db.select().from(vnextReviewProjections).where(eq(vnextReviewProjections.streamId, streamId)),
      this.db.select().from(vnextJudgeAssignments).where(eq(vnextJudgeAssignments.streamId, streamId)),
    ]);
    return reviews.map(review => ({
      ...review,
      assignments: assignments.filter(assignment => assignment.reviewCaseId === review.reviewCaseId),
    }));
  }

  @Get("reviews/assigned")
  @UseGuards(AuthGuard)
  async assignedReviews(@Req() request: Request) {
    const walletAddresses = (request.account?.wallets ?? [])
      .filter(wallet => wallet.chainId === 31339)
      .map(wallet => wallet.address.toLowerCase());
    if (walletAddresses.length === 0) return [];
    const streamId = this.streamId();
    const assignments = await this.db.select().from(vnextJudgeAssignments).where(
      and(eq(vnextJudgeAssignments.streamId, streamId), inArray(vnextJudgeAssignments.judgeAddress, walletAddresses)),
    );
    const reviewCaseIds = [...new Set(assignments.map(assignment => assignment.reviewCaseId))];
    if (reviewCaseIds.length === 0) return [];
    const reviews = await this.db.select().from(vnextReviewProjections).where(
      and(eq(vnextReviewProjections.streamId, streamId), inArray(vnextReviewProjections.reviewCaseId, reviewCaseIds)),
    );
    return reviews.map(review => ({
      ...review,
      assignments: assignments.filter(assignment => assignment.reviewCaseId === review.reviewCaseId),
    }));
  }

  @Get("reviews/:reviewCaseId/assignments")
  async assignments(@Param("reviewCaseId") reviewCaseId: string) {
    return this.db.select().from(vnextJudgeAssignments).where(
      and(eq(vnextJudgeAssignments.streamId, this.streamId()), eq(vnextJudgeAssignments.reviewCaseId, reviewCaseId.toLowerCase())),
    );
  }

  @Get("reviews/:reviewCaseId")
  async review(@Param("reviewCaseId") reviewCaseId: string) {
    const [projection] = await this.db.select().from(vnextReviewProjections).where(
      and(eq(vnextReviewProjections.streamId, this.streamId()), eq(vnextReviewProjections.reviewCaseId, reviewCaseId.toLowerCase())),
    );
    if (!projection) throw new NotFoundException("VNext review projection not found");
    return projection;
  }

  private streamId() {
    if (!this.connection) throw new NotFoundException("VNext deployment is not configured");
    return `vnext:${this.connection.manifest.chainId}:${this.connection.manifest.campaignEscrow}:${this.connection.manifest.genesisHash}`;
  }
}
