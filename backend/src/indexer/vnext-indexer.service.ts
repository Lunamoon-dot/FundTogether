import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, inArray, or, sql } from "drizzle-orm";
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
  vnextBackerProjections,
  vnextChallengeProjections,
  vnextJudgeAssignments,
  vnextJudgeLedgerProjections,
  vnextMilestoneProjections,
  vnextReviewProjections,
} from "../database/schema";
import {
  parseVNextDeploymentManifest,
  verifyVNextDeployment,
  vnextCampaignAbi,
  vnextCampaignEventAbi,
  vnextClient,
  vnextRegistryAbi,
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

type VNextTransaction = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
type VNextQueryClient = NodePgDatabase<typeof schema> | VNextTransaction;

type DecodedVNextEvent = {
  eventName: string;
  args: Record<string, unknown>;
};

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
    await this.verifyDeployment(client, manifest);
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
      ...(await client.getLogs({ address: manifest.juryRegistry, fromBlock, toBlock: head.number })),
    ].sort((left, right) => Number(left.blockNumber - right.blockNumber) || Number(left.logIndex - right.logIndex));

    const decodedLogs = logs.map(log => {
      if (
        log.removed || log.transactionHash == null || log.logIndex == null
        || log.blockHash == null || log.blockNumber == null
      ) {
        throw new Error("Malformed VNext event identity");
      }
      const decoded = this.decode(log);
      if (!decoded) {
        throw new Error(`unknown VNext event at ${log.transactionHash}:${log.logIndex}`);
      }
      return { log, decoded };
    });

    let processed = 0;
    for (let cursor = 0; cursor < decodedLogs.length;) {
      const blockNumber = decodedLogs[cursor].log.blockNumber!;
      const blockEvents: Array<{ log: Log; decoded: DecodedVNextEvent }> = [];
      while (cursor < decodedLogs.length && decodedLogs[cursor].log.blockNumber === blockNumber) {
        blockEvents.push(decodedLogs[cursor]);
        cursor++;
      }
      processed += await this.persistBlock(streamId, blockEvents);
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

  private verifyDeployment(client: PublicClient, manifest: VNextDeploymentManifest) {
    return verifyVNextDeployment(client, manifest);
  }

  private decode(log: Log) {
    for (const abi of [vnextCampaignAbi, vnextCampaignEventAbi, vnextReviewAbi, vnextRegistryAbi]) {
      try {
        const [event] = parseEventLogs({ abi, logs: [log], strict: true });
        if (event) return { eventName: event.eventName, args: eventArgs(event) };
      } catch {
        // The other VNext contract ABI may own this log.
      }
    }
    return null;
  }

  private async persistEvent(streamId: string, log: Log, decoded: DecodedVNextEvent) {
    return this.db.transaction(async tx => {
      await this.ensureStream(tx, streamId);
      const applied = await this.persistEventInTransaction(tx, streamId, log, decoded);
      await this.updateCheckpoint(tx, streamId, log);
      return applied;
    });
  }

  private async persistBlock(
    streamId: string,
    events: Array<{ log: Log; decoded: DecodedVNextEvent }>,
  ) {
    return this.db.transaction(async tx => {
      await this.ensureStream(tx, streamId);
      let applied = 0;
      for (const item of events) {
        if (await this.persistEventInTransaction(tx, streamId, item.log, item.decoded)) applied++;
      }
      await this.updateCheckpoint(tx, streamId, events[events.length - 1].log);
      return applied;
    });
  }

  private async ensureStream(tx: VNextQueryClient, streamId: string) {
    await tx.insert(indexerStreams).values({ streamId, status: "syncing", updatedAt: new Date() }).onConflictDoNothing();
  }

  private async updateCheckpoint(tx: VNextQueryClient, streamId: string, log: Log) {
    await tx.insert(indexerStreams).values({
      streamId,
      lastBlock: log.blockNumber!.toString(),
      lastBlockHash: log.blockHash!,
      headBlock: log.blockNumber!.toString(),
      status: "synced",
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: indexerStreams.streamId,
      set: {
        lastBlock: log.blockNumber!.toString(),
        lastBlockHash: log.blockHash!,
        headBlock: log.blockNumber!.toString(),
        status: "synced",
        updatedAt: new Date(),
      },
    });
  }

  private async persistEventInTransaction(
    tx: VNextQueryClient,
    streamId: string,
    log: Log,
    decoded: DecodedVNextEvent,
  ) {
    const transactionHash = log.transactionHash!;
    const logIndex = Number(log.logIndex);
    const blockNumber = log.blockNumber!;
    const [inserted] = await tx.insert(vnextChainEvents).values({
      streamId,
      transactionHash,
      logIndex,
      blockHash: log.blockHash!,
      blockNumber: blockNumber.toString(),
      eventName: decoded.eventName,
      args: jsonSafe(decoded.args) as Record<string, unknown>,
      canonical: true,
    }).onConflictDoNothing({
      target: [vnextChainEvents.streamId, vnextChainEvents.transactionHash, vnextChainEvents.logIndex],
    }).returning({ transactionHash: vnextChainEvents.transactionHash });
    if (!inserted) return false;

    await this.applyPersistentProjection(tx, streamId, log, decoded.eventName, decoded.args);
    return true;
  }

  private async applyPersistentProjection(
    tx: VNextQueryClient,
    streamId: string,
    log: Log,
    eventName: string,
    args: Record<string, unknown>,
  ) {
    const blockNumber = log.blockNumber!;
    if (eventName === "CampaignCreated") {
      await tx.insert(vnextCampaignProjections).values({
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
    } else if (eventName === "PublicationEvidenceSubmitted") {
      await tx.update(vnextCampaignProjections).set({
        publicationEvidenceHash: textArg(args, "evidenceHash").toLowerCase(),
        publicationReviewCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "PublicationReviewCaseChanged") {
      await tx.update(vnextCampaignProjections).set({
        publicationReviewCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "PublicationFinalized") {
      await tx.update(vnextCampaignProjections).set({
        state: boolArg(args, "successful") ? 1 : 5,
        publicationOutcome: boolArg(args, "successful") ? 1 : 3,
        lastBlockNumber: blockNumber.toString(),
        lastEventName: eventName,
        updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "ContributionReceived") {
      await tx.update(vnextCampaignProjections).set({
        raised: textArg(args, "cumulativeRaised"), lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
      await tx.insert(vnextBackerProjections).values({
        streamId,
        onchainCampaignId: textArg(args, "campaignId"),
        backerAddress: textArg(args, "backer").toLowerCase(),
        contributed: textArg(args, "amount"),
        lastBlockNumber: blockNumber.toString(),
      }).onConflictDoUpdate({
        target: [vnextBackerProjections.streamId, vnextBackerProjections.onchainCampaignId, vnextBackerProjections.backerAddress],
        set: {
          contributed: sql`${vnextBackerProjections.contributed} + ${textArg(args, "amount")}`,
          lastBlockNumber: blockNumber.toString(),
          updatedAt: new Date(),
        },
      });
    } else if (eventName === "FundingFinalized") {
      await tx.update(vnextCampaignProjections).set({
        state: boolArg(args, "successful") ? 3 : 5, raised: textArg(args, "raised"), lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "CampaignRefundsOpened") {
      await tx.update(vnextCampaignProjections).set({
        state: 5, lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "BackerRefundClaimed") {
      await tx.update(vnextCampaignProjections).set({
        refunded: sql`${vnextCampaignProjections.refunded} + ${textArg(args, "amount")}`,
        lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
      await tx.insert(vnextBackerProjections).values({
        streamId,
        onchainCampaignId: textArg(args, "campaignId"),
        backerAddress: textArg(args, "backer").toLowerCase(),
        refunded: textArg(args, "amount"),
        refundClaimed: true,
        lastBlockNumber: blockNumber.toString(),
      }).onConflictDoUpdate({
        target: [vnextBackerProjections.streamId, vnextBackerProjections.onchainCampaignId, vnextBackerProjections.backerAddress],
        set: {
          refunded: sql`${vnextBackerProjections.refunded} + ${textArg(args, "amount")}`,
          refundClaimed: true,
          lastBlockNumber: blockNumber.toString(),
          updatedAt: new Date(),
        },
      });
    } else if (eventName === "CampaignCompleted") {
      await tx.update(vnextCampaignProjections).set({
        state: 4, lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "MilestoneEvidenceSubmitted") {
      await tx.insert(vnextMilestoneProjections).values({
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
      await tx.update(vnextMilestoneProjections).set({ paid: true, state: 10, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextMilestoneProjections.streamId, streamId), eq(vnextMilestoneProjections.onchainCampaignId, textArg(args, "campaignId")), eq(vnextMilestoneProjections.milestoneId, Number(textArg(args, "milestoneId")))));
      await tx.update(vnextCampaignProjections).set({ paidOut: sql`${vnextCampaignProjections.paidOut} + ${textArg(args, "amount")}`, lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date() }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    } else if (eventName === "MilestoneRevisionSubmitted") {
      await tx.update(vnextMilestoneProjections).set({
        evidenceRevision: textArg(args, "evidenceRevision"), evidenceHash: textArg(args, "evidenceHash").toLowerCase(),
        state: 2, lastBlockNumber: blockNumber.toString(), updatedAt: new Date(),
      }).where(and(eq(vnextMilestoneProjections.streamId, streamId), eq(vnextMilestoneProjections.onchainCampaignId, textArg(args, "campaignId")), eq(vnextMilestoneProjections.milestoneId, Number(textArg(args, "milestoneId")))));
    } else if (eventName === "MilestoneReviewStateChanged") {
      const outcome = Number(textArg(args, "outcome"));
      const challengeDeadline = textArg(args, "challengeDeadline");
      const correctionDeadline = textArg(args, "correctionDeadline");
      await tx.update(vnextMilestoneProjections).set({
        reviewCaseId: textArg(args, "reviewCaseId").toLowerCase(),
        finalOutcome: outcome === 0 ? null : outcome,
        challengeDeadline: challengeDeadline === "0" ? null : challengeDeadline,
        correctionDeadline: correctionDeadline === "0" ? null : correctionDeadline,
        state: Number(textArg(args, "state")),
        lastBlockNumber: blockNumber.toString(),
        updatedAt: new Date(),
      }).where(and(
        eq(vnextMilestoneProjections.streamId, streamId),
        eq(vnextMilestoneProjections.onchainCampaignId, textArg(args, "campaignId")),
        eq(vnextMilestoneProjections.milestoneId, Number(textArg(args, "milestoneId"))),
      ));
    } else if (eventName === "ChallengeOpened") {
      await tx.insert(vnextChallengeProjections).values({
        streamId,
        onchainCampaignId: textArg(args, "campaignId"),
        milestoneId: Number(textArg(args, "milestoneId")),
        challengeCaseId: textArg(args, "challengeCaseId").toLowerCase(),
        challenger: textArg(args, "challenger").toLowerCase(),
        evidenceHash: textArg(args, "evidenceHash").toLowerCase(),
        lastBlockNumber: blockNumber.toString(),
      }).onConflictDoNothing();
    } else if (eventName === "ChallengeResolved") {
      await tx.update(vnextMilestoneProjections).set({
        state: Number(textArg(args, "outcome")) === 1 ? 9 : 14,
        lastBlockNumber: blockNumber.toString(), updatedAt: new Date(),
      }).where(and(eq(vnextMilestoneProjections.streamId, streamId), eq(vnextMilestoneProjections.onchainCampaignId, textArg(args, "campaignId")), eq(vnextMilestoneProjections.milestoneId, Number(textArg(args, "milestoneId")))));
      await tx.update(vnextChallengeProjections).set({
        outcome: Number(textArg(args, "outcome")),
        lastBlockNumber: blockNumber.toString(),
        updatedAt: new Date(),
      }).where(and(
        eq(vnextChallengeProjections.streamId, streamId),
        eq(vnextChallengeProjections.challengeCaseId, textArg(args, "challengeCaseId").toLowerCase()),
      ));
    } else if (eventName === "ReviewCaseCreated") {
      await tx.insert(vnextReviewProjections).values({
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
      await tx.update(vnextReviewProjections).set({ enrolledCount: sql`${vnextReviewProjections.enrolledCount} + 1`, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "JurySnapshotFinalized") {
      await tx.update(vnextReviewProjections).set({
        courtCount: (BigInt(textArg(args, "eligibleCount")) / 3n).toString(),
        lastBlockNumber: blockNumber.toString(),
        updatedAt: new Date(),
      }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "CourtFinalized") {
      const outcome = Number(textArg(args, "outcome"));
      await tx.update(vnextReviewProjections).set({
        finalizedCourtCount: sql`${vnextReviewProjections.finalizedCourtCount} + 1`,
        passCourts: sql`${vnextReviewProjections.passCourts} + CASE WHEN ${outcome} = 1 THEN 1 ELSE 0 END`,
        failCourts: sql`${vnextReviewProjections.failCourts} + CASE WHEN ${outcome} = 2 THEN 1 ELSE 0 END`,
        lastBlockNumber: blockNumber.toString(),
        updatedAt: new Date(),
      }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "ReviewRoundFinalized") {
      const passCourts = BigInt(textArg(args, "passCourts"));
      const failCourts = BigInt(textArg(args, "failCourts"));
      await tx.update(vnextReviewProjections).set({
        outcome: Number(textArg(args, "outcome")),
        finalized: true,
        finalizedCourtCount: (passCourts + failCourts).toString(),
        passCourts: passCourts.toString(),
        failCourts: failCourts.toString(),
        lastBlockNumber: blockNumber.toString(),
        updatedAt: new Date(),
      }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    } else if (eventName === "FinalRulingEstablished") {
      await tx.update(vnextReviewProjections).set({ outcome: Number(textArg(args, "outcome")), finalized: true, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
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
        await tx.insert(vnextJudgeAssignments).values(assignment).onConflictDoUpdate({
          target: [vnextJudgeAssignments.streamId, vnextJudgeAssignments.reviewCaseId, vnextJudgeAssignments.courtId, vnextJudgeAssignments.slot],
          set: { judgeAddress: assignment.judgeAddress, lastBlockNumber: assignment.lastBlockNumber },
        });
      }
    } else if (eventName === "CaseStakeReserved") {
      await this.updateJudgeLedger(tx, streamId, blockNumber, textArg(args, "reviewCaseId"), textArg(args, "judge"), "reserved", textArg(args, "amount"));
    } else if (eventName === "UnenrolledCaseStakeReleased") {
      await this.updateJudgeLedger(tx, streamId, blockNumber, textArg(args, "reviewCaseId"), textArg(args, "judge"), "released", textArg(args, "amount"));
    } else if (eventName === "CaseStakeSettled") {
      await this.updateJudgeLedger(tx, streamId, blockNumber, textArg(args, "reviewCaseId"), textArg(args, "judge"), "settled", textArg(args, "unlockedAmount"), textArg(args, "slashedAmount"));
    } else if (eventName === "JudgeRewardAccrued") {
      await this.updateJudgeLedger(tx, streamId, blockNumber, textArg(args, "reviewCaseId"), textArg(args, "judge"), "rewardAccrued", textArg(args, "amount"));
    } else if (eventName === "JudgeRewardClaimed") {
      await this.updateJudgeLedger(tx, streamId, blockNumber, textArg(args, "reviewCaseId"), textArg(args, "judge"), "rewardClaimed", textArg(args, "amount"));
    }

    if (eventName === "ReviewRetryOpened") {
      const previousCaseId = textArg(args, "rootCaseId");
      const nextCaseId = textArg(args, "reviewCaseId");
      await this.copyReviewToNewCase(tx, streamId, log, previousCaseId, nextCaseId, textArg(args, "retryRoundId"));
      await this.updateMilestoneReviewCase(tx, streamId, log, previousCaseId, nextCaseId, 2);
    } else if (eventName === "AppealOpened") {
      const previousCaseId = textArg(args, "reviewCaseId");
      const nextCaseId = textArg(args, "appealCaseId");
      await this.copyReviewToNewCase(tx, streamId, log, previousCaseId, nextCaseId, textArg(args, "appealRoundId"));
      await this.updateMilestoneReviewCase(tx, streamId, log, previousCaseId, nextCaseId, 6);
    } else if (eventName === "AppealRoundFinalized") {
      await this.updateReviewFinality(tx, streamId, log, textArg(args, "reviewCaseId"), Number(textArg(args, "outcome")));
    } else if (eventName === "ReviewCaseSettled") {
      await this.updateReviewFinality(tx, streamId, log, textArg(args, "reviewCaseId"), Number(textArg(args, "outcome")));
    } else if (eventName === "ReviewSettlementProgress" || eventName === "UnenrolledCaseStakeReleased" || eventName === "CaseStakeReserved" || eventName === "CaseStakeSettled" || eventName === "JudgeRewardAccrued" || eventName === "JurySnapshotFinalized" || eventName === "CourtFinalized" || eventName === "VoteCommitted" || eventName === "VoteRevealed" || eventName === "JudgeSlashed" || eventName === "JudgeRewardClaimed") {
      await tx.update(vnextReviewProjections).set({ lastBlockNumber: blockNumber.toString(), updatedAt: new Date() }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, textArg(args, "reviewCaseId").toLowerCase())));
    }

    if (eventName !== "CampaignCreated" && eventName !== "MilestonePaid" && eventName !== "CampaignRefundsOpened" && eventName !== "BackerRefundClaimed" && eventName !== "CampaignCompleted" && arg(args, "campaignId") !== undefined) {
      await tx.update(vnextCampaignProjections).set({
        lastBlockNumber: blockNumber.toString(), lastEventName: eventName, updatedAt: new Date(),
      }).where(and(eq(vnextCampaignProjections.streamId, streamId), eq(vnextCampaignProjections.onchainCampaignId, textArg(args, "campaignId"))));
    }
  }

  private async updateJudgeLedger(
    tx: VNextQueryClient,
    streamId: string,
    blockNumber: bigint,
    reviewCaseIdInput: string,
    judgeAddressInput: string,
    field: "reserved" | "released" | "settled" | "rewardAccrued" | "rewardClaimed",
    amount: string,
    slashedAmount = "0",
  ) {
    const reviewCaseId = reviewCaseIdInput.toLowerCase();
    const judgeAddress = judgeAddressInput.toLowerCase();
    const base = {
      streamId,
      reviewCaseId,
      judgeAddress,
      lastBlockNumber: blockNumber.toString(),
    };
    const values = field === "reserved"
      ? { ...base, reserved: amount }
      : field === "released"
        ? { ...base, released: amount }
        : field === "settled"
          ? { ...base, settled: amount, caseSlashed: slashedAmount }
          : field === "rewardAccrued"
            ? { ...base, rewardAccrued: amount }
            : { ...base, rewardClaimed: amount };
    const set = field === "reserved"
      ? { reserved: sql`${vnextJudgeLedgerProjections.reserved} + ${amount}` }
      : field === "released"
        ? { released: sql`${vnextJudgeLedgerProjections.released} + ${amount}` }
        : field === "settled"
          ? {
            settled: sql`${vnextJudgeLedgerProjections.settled} + ${amount}`,
            caseSlashed: sql`${vnextJudgeLedgerProjections.caseSlashed} + ${slashedAmount}`,
          }
          : field === "rewardAccrued"
            ? { rewardAccrued: sql`${vnextJudgeLedgerProjections.rewardAccrued} + ${amount}` }
            : { rewardClaimed: sql`${vnextJudgeLedgerProjections.rewardClaimed} + ${amount}` };
    await tx.insert(vnextJudgeLedgerProjections).values(values).onConflictDoUpdate({
      target: [vnextJudgeLedgerProjections.streamId, vnextJudgeLedgerProjections.reviewCaseId, vnextJudgeLedgerProjections.judgeAddress],
      set: { ...set, lastBlockNumber: blockNumber.toString(), updatedAt: new Date() },
    });
  }

  private async copyReviewToNewCase(
    tx: VNextQueryClient,
    streamId: string,
    log: Log,
    previousCaseId: string,
    newCaseId: string,
    roundId: string,
  ) {
    const [previous] = await tx.select().from(vnextReviewProjections).where(and(
      eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, previousCaseId.toLowerCase()),
    ));
    if (!previous) return;
    await tx.insert(vnextReviewProjections).values({
      streamId,
      reviewCaseId: newCaseId.toLowerCase(),
      rootCaseId: previous.rootCaseId,
      campaignId: previous.campaignId,
      milestoneId: previous.milestoneId,
      evidenceRevision: previous.evidenceRevision,
      roundId,
      creator: previous.creator,
      enrolledCount: "0",
      finalized: false,
      lastBlockNumber: log.blockNumber!.toString(),
    }).onConflictDoNothing();
  }

  private async updateReviewFinality(
    tx: VNextQueryClient,
    streamId: string,
    log: Log,
    reviewCaseId: string,
    outcome: number,
  ) {
    await tx.update(vnextReviewProjections).set({
      outcome, finalized: true, lastBlockNumber: log.blockNumber!.toString(), updatedAt: new Date(),
    }).where(and(eq(vnextReviewProjections.streamId, streamId), eq(vnextReviewProjections.reviewCaseId, reviewCaseId.toLowerCase())));
  }

  private async updateMilestoneReviewCase(
    tx: VNextQueryClient,
    streamId: string,
    log: Log,
    previousCaseId: string,
    nextCaseId: string,
    state: number,
  ) {
    const relatedCases = await tx.select({ reviewCaseId: vnextReviewProjections.reviewCaseId }).from(vnextReviewProjections).where(and(
      eq(vnextReviewProjections.streamId, streamId),
      or(
        eq(vnextReviewProjections.reviewCaseId, previousCaseId.toLowerCase()),
        eq(vnextReviewProjections.rootCaseId, previousCaseId.toLowerCase()),
      ),
    ));
    const caseIds = [...new Set([
      previousCaseId.toLowerCase(),
      ...relatedCases.map(item => item.reviewCaseId.toLowerCase()),
    ])];
    await tx.update(vnextMilestoneProjections).set({
      reviewCaseId: nextCaseId.toLowerCase(),
      finalOutcome: null,
      challengeDeadline: null,
      correctionDeadline: null,
      state,
      lastBlockNumber: log.blockNumber!.toString(),
      updatedAt: new Date(),
    }).where(and(
      eq(vnextMilestoneProjections.streamId, streamId),
      inArray(vnextMilestoneProjections.reviewCaseId, caseIds),
    ));
  }
}
