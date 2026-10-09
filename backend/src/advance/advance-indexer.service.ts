import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { decodeEventLog } from "viem";
import type { Hex } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { advanceCampaignPlans, advanceCampaignProjection, chainEvents, indexerStreams } from "../database/schema";
import { AdvanceBlockchainService } from "./advance-blockchain.service";
import { restoreGiftPlan } from "./advance-plan";
import type { AdvanceCampaignSnapshot, AdvanceDeployment } from "./advance.types";

export const advanceStreamKey = (d: AdvanceDeployment) => ["ADVANCE", d.chainId, d.contractAddress.toLowerCase(),
  d.deploymentId, d.genesisHash, d.deploymentBlockNumber, d.deploymentBlockHash].join(":");
export function matchingAdvancePlan(plan: ReturnType<typeof restoreGiftPlan>, snapshot: AdvanceCampaignSnapshot) {
  const c = snapshot.campaign;
  return plan.planHash === c.planHash && plan.organizer.toLowerCase() === c.organizer.toLowerCase()
    && plan.fundingDuration === c.fundingDuration && c.goal === plan.budgets.reduce((sum, b) => sum + BigInt(b), 0n).toString()
    && plan.budgets.length === snapshot.stages.length && snapshot.stages.every((s, i) => s.budget === plan.budgets[i] && s.criteriaHash === plan.criteriaHashes[i]);
}
export interface AdvanceIndexerStatus {
  status: "syncing" | "ready" | "error" | "rebuilding";
  lastIndexedBlock: string | null; lastIndexedBlockHash: string | null;
  headBlock: string | null; chainTimestamp: string | null; error: string | null;
}

@Injectable()
export class AdvanceIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvanceIndexerService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, readonly chain: AdvanceBlockchainService) {}
  get streamKey() { return advanceStreamKey(this.chain.deployment); }
  onModuleInit() { if (process.env.INDEXER_ENABLED !== "false") this.schedule(0); }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { void this.runOnce().catch(() => this.logger.warn("B synchronization failed; checkpoint retained for retry"))
      .finally(() => this.schedule(2000)); }, delay);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
  }
  runOnce(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.processBatch().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async processBatch() {
    const streamId = this.streamKey;
    await this.chain.verifyDeployment();
    await this.db.insert(indexerStreams).values({ streamId }).onConflictDoNothing();
    try {
      await this.db.transaction(async tx => {
        const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${streamId})) as locked`);
        if (!lock.rows[0]?.locked) return;
        const [stored] = await tx.select().from(indexerStreams).where(eq(indexerStreams.streamId, streamId)).for("update");
        const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
        const target = head - BigInt(this.chain.context.confirmations - 1);
        const anchor = BigInt(this.chain.deployment.deploymentBlockNumber);
        if (target < anchor) throw new Error("B deployment anchor not confirmed");
        let previous = stored.lastBlock === null ? null : BigInt(stored.lastBlock);
        let rebuilding = stored.status === "rebuilding";
        if (previous !== null && (previous > head || (await this.chain.client.getBlock({ blockNumber: previous })).hash !== stored.lastBlockHash)) {
          await tx.update(chainEvents).set({ canonical: false }).where(eq(chainEvents.streamId, streamId));
          await tx.delete(advanceCampaignProjection).where(eq(advanceCampaignProjection.streamId, streamId));
          previous = null; rebuilding = true;
        }
        const from = previous === null ? anchor : previous + 1n;
        if (from > target) {
          await this.chain.verifyDeployment();
          await tx.update(indexerStreams).set({ status: "ready", error: null, headBlock: head.toString(), updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
          return;
        }
        const to = from + 99n < target ? from + 99n : target;
        const end = await this.chain.client.getBlock({ blockNumber: to });
        if (!end.hash) throw new Error("Pending end block");
        const logs = await this.chain.client.getLogs({ address: this.chain.context.contractAddress, fromBlock: from, toBlock: to });
        logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.transactionIndex! - b.transactionIndex! || a.logIndex! - b.logIndex!);
        const touched = new Set<string>(), publications = new Map<string, Hex>();
        const hashes = new Map<string, string>([[to.toString(), end.hash]]);
        for (const log of logs) {
          if (log.removed || !log.blockHash || log.blockNumber === null || !log.transactionHash || log.logIndex === null || log.transactionIndex === null
            || log.address.toLowerCase() !== this.chain.context.contractAddress.toLowerCase() || log.blockNumber < from || log.blockNumber > to)
            throw new Error("Invalid B canonical log");
          const number = log.blockNumber.toString();
          if (!hashes.has(number)) hashes.set(number, (await this.chain.client.getBlock({ blockNumber: log.blockNumber })).hash!);
          if (hashes.get(number) !== log.blockHash) throw new Error("Orphan B log");
          const event = decodeEventLog({ abi: this.chain.abi, data: log.data, topics: log.topics, strict: true });
          const args = JSON.parse(JSON.stringify(event.args, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
          const key = and(eq(chainEvents.streamId, streamId), eq(chainEvents.transactionHash, log.transactionHash),
            eq(chainEvents.logIndex, log.logIndex), eq(chainEvents.blockHash, log.blockHash));
          const [existing] = await tx.select().from(chainEvents).where(key);
          if (existing && (existing.blockNumber !== number || existing.eventName !== event.eventName || JSON.stringify(existing.args) !== JSON.stringify(args))) {
            // JSONB key ordering is not preserved by PostgreSQL.
            if (!existing || existing.blockNumber !== number || existing.eventName !== event.eventName
              || Object.keys(existing.args).length !== Object.keys(args).length
              || Object.keys(args).some(k => JSON.stringify(existing.args[k]) !== JSON.stringify(args[k])))
              throw new Error("Conflicting duplicate B event");
          }
          await tx.insert(chainEvents).values({ streamId, transactionHash: log.transactionHash, logIndex: log.logIndex, blockHash: log.blockHash,
            blockNumber: number, eventName: event.eventName!, args, canonical: true }).onConflictDoUpdate({
            target: [chainEvents.streamId, chainEvents.transactionHash, chainEvents.logIndex, chainEvents.blockHash], set: { canonical: true } });
          if (typeof args.campaignId === "string") {
            touched.add(args.campaignId);
            if (event.eventName === "CampaignPublished") publications.set(args.campaignId, log.transactionHash);
          }
        }
        // Deadlines advance with block time even when a campaign emits no new event.
        const oldRows = await tx.select().from(advanceCampaignProjection).where(eq(advanceCampaignProjection.streamId, streamId));
        for (const old of oldRows) if (!["COMPLETED", "STOPPED"].includes(old.snapshot.campaign.state)) touched.add(old.onchainCampaignId);
        const plans = await tx.select().from(advanceCampaignPlans).where(and(eq(advanceCampaignPlans.deploymentId, this.chain.context.deploymentId),
          eq(advanceCampaignPlans.chainId, this.chain.context.chainId), eq(advanceCampaignPlans.contractAddress, this.chain.context.contractAddress.toLowerCase()),
          isNotNull(advanceCampaignPlans.frozenAt)));
        for (const id of touched) {
          const snapshot = await this.chain.snapshot(BigInt(id), to);
          const old = oldRows.find(row => row.onchainCampaignId === id);
          snapshot.publicationTransactionHash = publications.get(id) ?? old?.snapshot.publicationTransactionHash ?? null;
          let metadataId: string | null = null;
          for (const row of plans) {
            let plan;
            try { plan = restoreGiftPlan(row, this.chain.deployment); } catch { continue; }
            if (!matchingAdvancePlan(plan, snapshot)) continue;
            const mapped = await this.chain.read("campaignForDraft", [plan.organizer, plan.draftKey], to) as bigint;
            if (mapped === BigInt(id) + 1n) { metadataId = row.campaignMetadataId; break; }
          }
          await tx.insert(advanceCampaignProjection).values({ streamId, onchainCampaignId: id, metadataId, snapshot }).onConflictDoUpdate({
            target: [advanceCampaignProjection.streamId, advanceCampaignProjection.onchainCampaignId], set: { metadataId, snapshot } });
        }
        if ((await this.chain.client.getBlock({ blockNumber: to })).hash !== end.hash
          || (previous !== null && (await this.chain.client.getBlock({ blockNumber: previous })).hash !== stored.lastBlockHash))
          throw new Error("B chain changed during batch");
        await this.chain.verifyDeployment();
        await tx.update(indexerStreams).set({ lastBlock: to.toString(), lastBlockHash: end.hash, headBlock: head.toString(),
          status: to === target ? "ready" : rebuilding ? "rebuilding" : "syncing", error: null, updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
      });
    } catch (error) {
      await this.db.update(indexerStreams).set({ status: "error", error: "B synchronization failed; checkpoint retained for retry", updatedAt: new Date() })
        .where(eq(indexerStreams.streamId, streamId));
      throw error;
    }
  }

  async status(): Promise<AdvanceIndexerStatus> {
    await this.chain.verifyDeployment();
    const [stream] = await this.db.select().from(indexerStreams).where(eq(indexerStreams.streamId, this.streamKey));
    const head = await this.chain.client.getBlock();
    if (!stream) return { status: "syncing", lastIndexedBlock: null, lastIndexedBlockHash: null,
      headBlock: head.number.toString(), chainTimestamp: head.timestamp.toString(), error: null };
    if (stream.lastBlock !== null && (BigInt(stream.lastBlock) > head.number
      || (await this.chain.client.getBlock({ blockNumber: BigInt(stream.lastBlock) })).hash !== stream.lastBlockHash))
      throw new ServiceUnavailableException("B indexed checkpoint is no longer canonical; replay required");
    const ready = stream.lastBlock !== null && BigInt(stream.lastBlock) >= head.number - BigInt(this.chain.context.confirmations - 1);
    return { status: stream.status === "error" || stream.status === "rebuilding" ? stream.status : ready ? "ready" : "syncing",
      lastIndexedBlock: stream.lastBlock, lastIndexedBlockHash: stream.lastBlockHash, headBlock: head.number.toString(),
      chainTimestamp: head.timestamp.toString(), error: stream.error };
  }
}
