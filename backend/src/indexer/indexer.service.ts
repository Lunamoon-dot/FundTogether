import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { decodeEventLog } from 'viem';
import type { Address } from 'viem';
import { BlockchainService, matchesSubmission } from '../blockchain/blockchain.service';
import { DRIZZLE_DB } from '../database/database.constants';
import * as schema from '../database/schema';
import { campaignChainProjection, campaignSubmissions, chainEvents, indexerStreams } from '../database/schema';
import { deploymentAnchorMatches } from '../blockchain/blockchain.constants';

const BATCH_BLOCKS = 100n;
const POLL_MS = 2_000;
export interface IndexerStatus {
  status: 'syncing' | 'ready' | 'error' | 'rebuilding';
  lastIndexedBlock: string | null;
  lastIndexedBlockHash: string | null;
  headBlock: string | null;
  error: string | null;
}

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;

  constructor(@Inject(DRIZZLE_DB) private readonly database: NodePgDatabase<typeof schema>, readonly chain: BlockchainService) {}

  get streamKey() {
    const deployment = this.chain.deployment;
    const legacy = `${deployment.chainId}:${deployment.contractAddress.toLowerCase()}:${deployment.genesisHash}`;
    // Existing deployments retain their durable stream. New manifests bind an
    // incarnation to its mined deployment block, not just a reusable Anvil address.
    return deployment.deploymentBlockHash ? `${legacy}:${deployment.deploymentBlockHash}` : legacy;
  }

  onModuleInit() {
    if (process.env.INDEXER_ENABLED !== 'false') this.schedule(0);
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runOnce().catch(error => this.logger.warn({
        message: 'Indexer batch failed; checkpoint retained for retry.',
        reason: error instanceof ServiceUnavailableException ? error.message : 'Blockchain or database operation failed.',
      }))
        .finally(() => this.schedule(POLL_MS));
    }, delay);
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
    await this.database.insert(indexerStreams).values({ streamId }).onConflictDoNothing();
    try {
      await this.chain.verifyDeployment();
      await this.database.transaction(async tx => {
        // One stream can have many API/worker processes, but only one committing worker.
        const result = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${streamId})) as locked`);
        if (!result.rows[0]?.locked) return;
        const [stored] = await tx.select().from(indexerStreams).where(eq(indexerStreams.streamId, streamId)).for('update');
        const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
        const target = head - BigInt(this.chain.deployment.confirmations - 1);
        if (target < 0n) return;
        let previous = stored.lastBlock === null ? null : BigInt(stored.lastBlock);
        let rebuilding = stored.status === 'rebuilding';
        if (previous !== null) {
          const same = previous <= head && (await this.chain.client.getBlock({ blockNumber: previous })).hash === stored.lastBlockHash;
          if (!same) {
            // Rebuild this deployment, retaining orphaned incarnations for audit/debugging.
            await tx.update(chainEvents).set({ canonical: false }).where(eq(chainEvents.streamId, streamId));
            await tx.delete(campaignChainProjection).where(eq(campaignChainProjection.streamId, streamId));
            previous = null;
            rebuilding = true;
          }
        }
        const from = previous === null ? 0n : previous + 1n;
        if (from > target) {
          await tx.update(indexerStreams).set({ status: 'ready', error: null, headBlock: head.toString(), updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
          return;
        }
        const to = from + BATCH_BLOCKS - 1n < target ? from + BATCH_BLOCKS - 1n : target;
        const end = await this.chain.client.getBlock({ blockNumber: to });
        const logs = await this.chain.client.getLogs({ address: this.chain.deployment.contractAddress as Address, fromBlock: from, toBlock: to });
        logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.transactionIndex! - b.transactionIndex! || a.logIndex! - b.logIndex!);
        const touched = new Set<string>();
        const publications = new Map<string, `0x${string}`>();
        const blockHashes = new Map<string, string>();
        blockHashes.set(to.toString(), end.hash!);
        for (const log of logs) {
          if (log.removed || !log.blockHash || log.blockNumber === null || !log.transactionHash || log.logIndex === null || log.address.toLowerCase() !== this.chain.deployment.contractAddress.toLowerCase())
            throw new Error('Invalid canonical log');
          const number = log.blockNumber.toString();
          if (!blockHashes.has(number)) blockHashes.set(number, (await this.chain.client.getBlock({ blockNumber: log.blockNumber })).hash!);
          if (blockHashes.get(number) !== log.blockHash) throw new Error('Log belongs to a changed block');
          const event = decodeEventLog({ abi: this.chain.abi, data: log.data, topics: log.topics, strict: true });
          const args = JSON.parse(JSON.stringify(event.args, (_key, value) => typeof value === 'bigint' ? value.toString() : value)) as Record<string, unknown>;
          await tx.insert(chainEvents).values({ streamId, transactionHash: log.transactionHash, logIndex: log.logIndex, blockHash: log.blockHash,
            blockNumber: number, eventName: event.eventName!, args, canonical: true })
            .onConflictDoUpdate({ target: [chainEvents.streamId, chainEvents.transactionHash, chainEvents.logIndex, chainEvents.blockHash], set: { canonical: true } });
          if (typeof args.campaignId === 'string') {
            touched.add(args.campaignId);
            if (event.eventName === 'CampaignPublished') publications.set(args.campaignId, log.transactionHash);
          }
        }
        const submissions = await tx.select().from(campaignSubmissions);
        for (const id of touched) {
          const snapshot = await this.chain.snapshot(BigInt(id), to);
          const [old] = await tx.select().from(campaignChainProjection).where(and(eq(campaignChainProjection.streamId, streamId), eq(campaignChainProjection.onchainCampaignId, id)));
          snapshot.published = Boolean(old?.snapshot.published || publications.has(id));
          snapshot.publicationTransactionHash = publications.get(id) ?? old?.snapshot.publicationTransactionHash ?? null;
          let metadataId: string | null = null;
          for (const submission of submissions) {
            const plan = submission.plan;
            const deployment = this.chain.deployment;
            if (plan.chainId !== deployment.chainId || plan.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase() ||
                plan.genesisHash !== deployment.genesisHash || plan.contractCodeHash !== deployment.contractCodeHash || plan.tokenCodeHash !== deployment.tokenCodeHash ||
                !deploymentAnchorMatches(plan, deployment) || !matchesSubmission(plan, snapshot)) continue;
            const keyed = await this.chain.read('campaignForDraft', [plan.organizer, plan.draftKey], to) as bigint;
            if (keyed === BigInt(id) + 1n) { metadataId = submission.campaignMetadataId; break; }
          }
          await tx.insert(campaignChainProjection).values({ streamId, onchainCampaignId: id, metadataId, snapshot })
            .onConflictDoUpdate({ target: [campaignChainProjection.streamId, campaignChainProjection.onchainCampaignId], set: { metadataId, snapshot } });
        }
        // Reject a fork that occurred anywhere while fetching logs/state, before committing.
        if ((await this.chain.client.getBlock({ blockNumber: to })).hash !== end.hash ||
            (previous !== null && (await this.chain.client.getBlock({ blockNumber: previous })).hash !== stored.lastBlockHash))
          throw new Error('Chain changed during batch');
        // Also reject a reset/endpoint change whose deployment identity changed
        // while reading. A failed check rolls back events, projection and checkpoint.
        await this.chain.verifyDeployment();
        await tx.update(indexerStreams).set({ lastBlock: to.toString(), lastBlockHash: end.hash, headBlock: head.toString(),
          status: to === target ? 'ready' : rebuilding ? 'rebuilding' : 'syncing', error: null, updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
      });
    } catch (error) {
      await this.database.update(indexerStreams).set({
        status: sql`case when ${indexerStreams.status} = 'rebuilding' then 'rebuilding' else 'error' end`,
        error: 'Blockchain synchronization failed; retrying without advancing the checkpoint.', updatedAt: new Date(),
      }).where(eq(indexerStreams.streamId, streamId));
      throw error;
    }
  }

  async status(): Promise<IndexerStatus> {
    try {
      await this.chain.verifyDeployment();
      const [stream] = await this.database.select().from(indexerStreams).where(eq(indexerStreams.streamId, this.streamKey));
      if (!stream) return { status: 'syncing', lastIndexedBlock: null, lastIndexedBlockHash: null, headBlock: null, error: null };
      if (stream.status === 'error' || stream.status === 'rebuilding') throw new ServiceUnavailableException('Campaign data is being reconciled with the blockchain. Retry shortly.');
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      if (stream.lastBlock !== null && (BigInt(stream.lastBlock) > head ||
          (await this.chain.client.getBlock({ blockNumber: BigInt(stream.lastBlock) })).hash !== stream.lastBlockHash))
        throw new ServiceUnavailableException('The indexed block is no longer canonical. Rebuilding is required.');
      return { status: stream.lastBlock !== null && BigInt(stream.lastBlock) >= head - BigInt(this.chain.deployment.confirmations - 1) ? 'ready' : 'syncing',
        lastIndexedBlock: stream.lastBlock, lastIndexedBlockHash: stream.lastBlockHash, headBlock: head.toString(), error: null };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Campaign synchronization could not be verified. Retry shortly.');
    }
  }
}
