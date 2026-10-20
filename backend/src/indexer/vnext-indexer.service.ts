import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEventLogs } from "viem";
import type { Log, PublicClient } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import {
  indexerStreams,
  vnextCampaignProjections,
  vnextChainEvents,
  vnextJudgeAssignments,
  vnextMilestoneProjections,
  vnextReviewProjections,
} from "../database/schema";
import {
  parseVNextDeploymentManifest,
  verifyVNextDeployment,
  vnextCampaignAbi,
  vnextClient,
  vnextReviewAbi,
  type VNextDeploymentManifest,
} from "../blockchain/vnext-deployment";

export const VNEXT_CONNECTION = Symbol("VNEXT_CONNECTION");
export interface VNextConnection {
  manifest: VNextDeploymentManifest;
  client: PublicClient;
}

export function loadVNextConnection(): VNextConnection | null {
  const file = process.env.FUNDTOGETHER_VNEXT_MANIFEST_PATH
    || resolve(process.cwd(), "../.local/fundtogether/generated/vnext-deployment.local.json");
  if (!existsSync(file)) return null;
  const manifest = parseVNextDeploymentManifest(JSON.parse(readFileSync(file, "utf8")));
  return { manifest, client: vnextClient(manifest) as PublicClient };
}

const jsonSafe = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, item) =>
  typeof item === "bigint" ? item.toString() : item));

function arg(args: Record<string, unknown>, key: string): unknown {
  return args[key];
}

function textArg(args: Record<string, unknown>, key: string): string {
  const value = arg(args, key);
  return typeof value === "bigint" ? value.toString() : String(value ?? "");
}

function boolArg(args: Record<string, unknown>, key: string): boolean {
  return Boolean(arg(args, key));
}

function eventArgs(event: { args?: readonly unknown[] | Record<string, unknown> }) {
  return (event.args && !Array.isArray(event.args) ? event.args : {}) as Record<string, unknown>;
}

@Injectable()
export class VNextIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VNextIndexerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<{ fromBlock: string; toBlock: string; events: number }> | null = null;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(VNEXT_CONNECTION) private readonly connection: VNextConnection | null,
  ) {}

  onModuleInit() {
    if (!this.connection || process.env.FUNDTOGETHER_VNEXT_INDEXER_ENABLED === "false" || process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => { void this.runOnce().catch(() => this.logger.debug("VNext sync unavailable")); }, 4000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  streamId() {
    if (!this.connection) throw new ServiceUnavailableException("VNext deployment is not configured");
    const { manifest } = this.connection;
    return `vnext:${manifest.chainId}:${manifest.campaignEscrow}:${manifest.genesisHash}`;
  }

  async runOnce() {
    if (this.running) return this.running;
    this.running = this.sync().finally(() => { this.running = null; });
    return this.running;
  }

  private async sync() {
    if (!this.connection) throw new ServiceUnavailableException("VNext deployment is not configured");
    const { client, manifest } = this.connection;
    await verifyVNextDeployment(client, manifest);
    const streamId = this.streamId();
    const head = await client.getBlock({ blockTag: "latest" });
    const [stream] = await this.db.select().from(indexerStreams).where(eq(indexerStreams.streamId, streamId));
    const fromBlock = stream?.lastBlock ? BigInt(stream.lastBlock) + 1n : BigInt(manifest.deploymentBlockNumber);
    if (fromBlock > head.number) {
      await this.db.insert(indexerStreams).values({ streamId, headBlock: head.number.toString(), status: "synced" })
        .onConflictDoUpdate({ target: indexerStreams.streamId, set: { headBlock: head.number.toString(), status: "synced", updatedAt: new Date() } });
      return { fromBlock: fromBlock.toString(), toBlock: head.number.toString(), events: 0 };
    }

    const logs = [
      ...(await client.getLogs({ address: manifest.campaignEscrow, fromBlock, toBlock: head.number })),
      ...(await client.getLogs({ address: manifest.juryReview, fromBlock, toBlock: head.number })),
    ].sort((left, right) => Number(left.blockNumber - right.blockNumber) || Number(left.logIndex - right.logIndex));
    let processed = 0;
    for (const log of logs) {
      const decoded = this.decode(log);
      if (!decoded) continue;
      await this.persistEvent(streamId, log, decoded.eventName, decoded.args);
      processed++;
    }
    await this.db.insert(indexerStreams).values({
      streamId,
      lastBlock: head.number.toString(),
      lastBlockHash: head.hash ?? undefined,
      headBlock: head.number.toString(),
      status: "synced",
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: indexerStreams.streamId,
      set: {
        lastBlock: head.number.toString(),
        lastBlockHash: head.hash ?? undefined,
        headBlock: head.number.toString(),
        status: "synced",
        updatedAt: new Date(),
      },
    });
    return { fromBlock: fromBlock.toString(), toBlock: head.number.toString(), events: processed };
  }

  private decode(log: Log) {
    for (const abi of [vnextCampaignAbi, vnextReviewAbi]) {
      try {
        const [event] = parseEventLogs({ abi, logs: [log], strict: true });
        if (event) return { eventName: event.eventName, args: eventArgs(event) };
      } catch {
        // The other VNext contract ABI may own this log.
      }
    }
    return null;
  }

  private async persistEvent(
    streamId: string,
    log: Log,
    eventName: string,
    args: Record<string, unknown>,
  ) {
    const transactionHash = log.transactionHash!;
    const logIndex = Number(log.logIndex);
    const blockNumber = log.blockNumber!;
    await this.db.insert(vnextChainEvents).values({
      streamId,
      transactionHash,
      logIndex,
      blockHash: log.blockHash!,
      blockNumber: blockNumber.toString(),
      eventName,
      args: jsonSafe(args) as Record<string, unknown>,
      canonical: true,
    }).onConflictDoUpdate({
      target: [vnextChainEvents.streamId, vnextChainEvents.transactionHash, vnextChainEvents.logIndex],
      set: { blockHash: log.blockHash!, blockNumber: blockNumber.toString(), eventName, args: jsonSafe(args) as Record<string, unknown>, canonical: true },
    });

    if (eventName === "CampaignCreated") {
      await this.db.insert(vnextCampaignProjections).values({
        streamId,
        onchainCampaignId: textArg(args, "campaignId"),
        creator: textArg(args, "creator").toLowerCase(),
        payoutWallet: textArg(args, "payoutWallet").toLowerCase(),
        termsHash: textArg(args, "commitmentHash").toLowerCase(),
        publicationEvidenceHash: textArg(args, "publicationEvidenceHash").toLowerCase(),
        publicationReviewCaseId: textArg(args, "publicationReviewCaseId").toLowerCase(),
        policyVersion: textArg(args, "policyVersion"),
        goal: textArg(args, "goal"),
        fundingDeadline: textArg(args, "fundingDeadline"),
        state: 0,
        lastBlockNumber: blockNumber.toString(),
        lastEventName: eventName,
      }).onConflictDoNothing();
    } else if (eventName === "PublicationFinalized") {
      await this.db.update(vnextCampaignProjections).set({
        state: boolArg(args, "successful") ? 1 : 5,
        publicationOutcome: boolArg(args, "successful") ? 1 : 3,
        lastBlockNumber: blockNumber.toString(),
        lastEventName: eventName,
        updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "ContributionReceived") {
      await this.db.update(vnextCampaignProjections).set({
        raised: textArg(args, "cumulativeRaised"), lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "FundingFinalized") {
      await this.db.update(vnextCampaignProjections).set({
        state: boolArg(args, "successful") ? 2 : 5, raised: textArg(args, "raised"), lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "MilestoneEvidenceSubmitted") {
      await this.db.insert(vnextMilestoneProjections).values({
        streamId,
        onchainCampaignId: textArg(args, "campaignId"),
        milestoneId: Number(textArg(args, "milestoneId")),
        evidenceRevision: textArg(args, "evidenceRevision"),
        evidenceHash: textArg(args, "evidenceHash").toLowerCase(),
        reviewCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        state: 2,
        paid: false,
        lastBlockNumber: blockNumber.toString(),
      }).onConflictDoUpdate({
        target: [vnextMilestoneProjections.streamId, vnextMilestoneProjections.onchainCampaignId, vnextMilestoneProjections.milestoneId],
        set: { evidenceRevision: textArg(args, "evidenceRevision"), evidenceHash: textArg(args, "evidenceHash").toLowerCase(), reviewCaseId: textArg(args, "reviewCaseId").toLowerCase(), state: 2, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() },
      });
    } else if (eventName === "MilestonePaid") {
      await this.db.update(vnextMilestoneProjections).set({ paid: true, state: 10, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextMilestoneProjections.streamId, streamId), eq(vnextMilestoneProjections.onchainCampaignId, textArg(args, "campaignId")), eq(vnextMilestoneProjections.milestoneId, Number(textArg(args, "milestoneId")))));
      await this.db.update(vnextCampaignProjections).set({ paidOut: sql`${vnextCampaignProjections.paidOut} + ${textArg(args, "amount")}`, lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date() }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "ReviewCaseCreated") {
      await this.db.insert(vnextReviewProjections).values({
        streamId,
        reviewCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        rootCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        campaignId: textArg(args, "campaignId"),
        milestoneId: textArg(args, "milestoneId"),
        evidenceRevision: textArg(args, "evidenceRevision"),
        roundId: "0",
        creator: textArg(args, "creator").toLowerCase(),
        lastBlockNumber: blockNumber.toString(),
      }).onConflictDoNothing();
    } else if (eventName === "JudgeEnrolled") {
      await this.db.update(vnextReviewProjections).set({ enrolledCount: sql`${vnextReviewProjections.enrolledCount} + 1`, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "ReviewRoundFinalized") {
      await this.db.update(vnextReviewProjections).set({ outcome: Number(textArg(args, "outcome")), finalized: true, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "FinalRulingEstablished") {
      await this.db.update(vnextReviewProjections).set({ outcome: Number(textArg(args, "outcome")), finalized: true, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "CourtAssigned") {
      const reviewCaseId = textArg(args, "reviewCaseId").toLowerCase();
      const values = ["judgeOne", "judgeTwo", "judgeThree"].map((key, slot) => ({
        streamId,
        reviewCaseId,
        roundId: textArg(args, "roundId"),
        courtId: textArg(args, "courtId"),
        slot,
        judgeAddress: textArg(args, key).toLowerCase(),
        lastBlockNumber: blockNumber.toString(),
      }));
      for (const assignment of values) {
        await this.db.insert(vnextJudgeAssignments).values(assignment).onConflictDoUpdate({
          target: [vnextJudgeAssignments.streamId, vnextJudgeAssignments.reviewCaseId, vnextJudgeAssignments.courtId, vnextJudgeAssignments.slot],
          set: { judgeAddress: assignment.judgeAddress, lastBlockNumber: assignment.lastBlockNumber },
        });
      }
    }
  }
}
