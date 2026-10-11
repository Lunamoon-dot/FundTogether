import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { decodeEventLog } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { chainEvents, disbursementCampaignProjection, disbursementCampaigns, indexerStreams } from "../database/schema";
import { HedBlockchainService } from "./hed-blockchain.service";
import type { HedDeployment } from "./hed.types";

export const hedStreamKey = (deployment: HedDeployment) => ["HED", deployment.chainId, deployment.contractAddress.toLowerCase(),
  deployment.genesisHash, deployment.deploymentBlockNumber, deployment.deploymentBlockHash].join(":");

@Injectable()
export class HedIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HedIndexerService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>, readonly chain: HedBlockchainService) {}
  get streamKey() { return hedStreamKey(this.chain.deployment); }
  onModuleInit() { if (process.env.HED_INDEXER_ENABLED === "true") this.schedule(0); }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => { void this.runOnce().catch(() => this.logger.warn("HED synchronization failed; checkpoint retained for retry"))
      .finally(() => this.schedule(2000)); }, delay);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.running?.catch(() => undefined); }
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
        if (target < anchor) throw new Error("HED deployment anchor not confirmed");
        let previous = stored.lastBlock === null ? null : BigInt(stored.lastBlock);
        if (previous !== null && (previous > head || (await this.chain.client.getBlock({ blockNumber: previous })).hash !== stored.lastBlockHash)) {
          await tx.update(chainEvents).set({ canonical: false }).where(eq(chainEvents.streamId, streamId));
          await tx.delete(disbursementCampaignProjection).where(eq(disbursementCampaignProjection.streamId, streamId));
          previous = null;
        }
        const from = previous === null ? anchor : previous + 1n;
        if (from > target) {
          await tx.update(indexerStreams).set({ status: "ready", error: null, headBlock: head.toString(), updatedAt: new Date() })
            .where(eq(indexerStreams.streamId, streamId));
          return;
        }
        const to = from + 99n < target ? from + 99n : target;
        const end = await this.chain.client.getBlock({ blockNumber: to });
        if (!end.hash) throw new Error("Pending HED end block");
        const logs = await this.chain.client.getLogs({ address: this.chain.context.contractAddress, fromBlock: from, toBlock: to });
        logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.transactionIndex! - b.transactionIndex! || a.logIndex! - b.logIndex!);
        const touched = new Set<string>();
        for (const log of logs) {
          if (log.removed || !log.blockHash || log.blockNumber === null || !log.transactionHash || log.logIndex === null || log.transactionIndex === null
            || log.address.toLowerCase() !== this.chain.context.contractAddress.toLowerCase()) throw new Error("Invalid HED canonical log");
          if ((await this.chain.client.getBlock({ blockNumber: log.blockNumber })).hash !== log.blockHash) throw new Error("Orphan HED log");
          const event = decodeEventLog({ abi: this.chain.abi, data: log.data, topics: log.topics, strict: true });
          const args = JSON.parse(JSON.stringify(event.args, (_key, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
          const key = and(eq(chainEvents.streamId, streamId), eq(chainEvents.transactionHash, log.transactionHash),
            eq(chainEvents.logIndex, log.logIndex), eq(chainEvents.blockHash, log.blockHash));
          const [existing] = await tx.select().from(chainEvents).where(key);
          if (existing && (existing.blockNumber !== log.blockNumber.toString() || existing.eventName !== event.eventName
            || JSON.stringify(existing.args) !== JSON.stringify(args))) throw new Error("Conflicting duplicate HED event");
          await tx.insert(chainEvents).values({ streamId, transactionHash: log.transactionHash, logIndex: log.logIndex, blockHash: log.blockHash,
            blockNumber: log.blockNumber.toString(), eventName: event.eventName!, args, canonical: true }).onConflictDoUpdate({
            target: [chainEvents.streamId, chainEvents.transactionHash, chainEvents.logIndex, chainEvents.blockHash], set: { canonical: true },
          });
          if (typeof args.campaignId === "string") touched.add(args.campaignId);
        }
        for (const onchainCampaignId of touched) {
          const snapshot = await this.chain.snapshot(BigInt(onchainCampaignId), to);
          const [mapping] = await tx.select({ campaignMetadataId: disbursementCampaigns.campaignMetadataId }).from(disbursementCampaigns).where(and(
            eq(disbursementCampaigns.chainId, this.chain.context.chainId), eq(disbursementCampaigns.contractAddress, this.chain.context.contractAddress.toLowerCase()),
            eq(disbursementCampaigns.onchainCampaignId, onchainCampaignId),
          )).limit(1);
          await tx.insert(disbursementCampaignProjection).values({ streamId, onchainCampaignId, metadataId: mapping?.campaignMetadataId ?? null, snapshot })
            .onConflictDoUpdate({ target: [disbursementCampaignProjection.streamId, disbursementCampaignProjection.onchainCampaignId],
              set: { metadataId: mapping?.campaignMetadataId ?? null, snapshot } });
        }
        if ((await this.chain.client.getBlock({ blockNumber: to })).hash !== end.hash) throw new Error("HED chain changed during batch");
        await this.chain.verifyDeployment();
        await tx.update(indexerStreams).set({ lastBlock: to.toString(), lastBlockHash: end.hash, headBlock: head.toString(),
          status: to === target ? "ready" : "syncing", error: null, updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
      });
    } catch (error) {
      await this.db.update(indexerStreams).set({ status: "error", error: "HED synchronization failed; checkpoint retained for retry", updatedAt: new Date() })
        .where(eq(indexerStreams.streamId, streamId));
      throw error;
    }
  }

  async status() {
    await this.chain.verifyDeployment();
    const [stream] = await this.db.select().from(indexerStreams).where(eq(indexerStreams.streamId, this.streamKey));
    const head = await this.chain.client.getBlock();
    if (!stream) return { status: "syncing", lastIndexedBlock: null, headBlock: head.number.toString(), chainTimestamp: head.timestamp.toString(), error: null };
    if (stream.lastBlock !== null && (BigInt(stream.lastBlock) > head.number
      || (await this.chain.client.getBlock({ blockNumber: BigInt(stream.lastBlock) })).hash !== stream.lastBlockHash))
      throw new ServiceUnavailableException("HED indexed checkpoint is no longer canonical; replay required");
    const ready = stream.lastBlock !== null && BigInt(stream.lastBlock) >= head.number - BigInt(this.chain.context.confirmations - 1);
    return { status: stream.status === "error" ? "error" : ready ? "ready" : "syncing", lastIndexedBlock: stream.lastBlock,
      headBlock: head.number.toString(), chainTimestamp: head.timestamp.toString(), error: stream.error };
  }
}
