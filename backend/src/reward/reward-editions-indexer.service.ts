import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEventLogs } from "viem";
import type { Log, PublicClient, TransactionReceipt } from "viem";
import { DRIZZLE_DB } from "../database/database.constants";
import * as schema from "../database/schema";
import { chainEvents, editionsChainCampaigns, editionsEntitlements, indexerStreams, rewardCampaigns, rewardReviews, walletLinks } from "../database/schema";
import type { EditionsChainSnapshot } from "../database/schema";
import { editionsAbi, editionsClient, EditionsDeployment, parseEditionsDeployment, verifyEditionsDeployment } from "../blockchain/editions-deployment";
import { editionsCommitment } from "./reward-editions-commitment";
import { createRewardCampaignDraftSchema } from "./reward-campaign.schema";

export const EDITIONS_CONNECTION = Symbol("EDITIONS_CONNECTION");
export interface EditionsConnection { manifest: EditionsDeployment; client: PublicClient }
export function loadEditionsConnection(): EditionsConnection | null {
  const file = process.env.EDITIONS_MANIFEST_PATH || resolve(process.cwd(), "../.local/reward/generated/editions-deployment.local.json");
  if (!existsSync(file)) return null;
  const manifest = parseEditionsDeployment(JSON.parse(readFileSync(file, "utf8")));
  return { manifest, client: editionsClient(manifest) as PublicClient };
}
const jsonSafe = <T>(value: unknown): T => JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));

@Injectable()
export class RewardEditionsIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardEditionsIndexerService.name);
  private running: Promise<{ blockNumber: string; events: number; entitlements: number }> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  constructor(@Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(EDITIONS_CONNECTION) private readonly connection: EditionsConnection | null) {}

  onModuleInit() {
    if (!this.connection || process.env.EDITIONS_INDEXER_POLL_ENABLED === "false" || process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => { void this.runOnce().catch(() => this.logger.debug("Editions sync unavailable")); }, 4000);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running?.catch(() => undefined); }

  private connected() {
    if (!this.connection) throw new ServiceUnavailableException("Editions deployment is not configured");
    return this.connection;
  }
  streamId() {
    const { manifest: m } = this.connected();
    return `editions:${m.chainId}:${m.contractAddress}:${m.genesisHash}`;
  }
  async deployment() {
    const { client, manifest } = this.connected();
    await verifyEditionsDeployment(client, manifest);
    return manifest;
  }
  async chainTime() { return (await this.connected().client.getBlock({ blockTag: "latest" })).timestamp; }
  async processReceipt(txHash: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new BadRequestException("Invalid transaction hash");
    const { client, manifest } = this.connected();
    await verifyEditionsDeployment(client, manifest);
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success" || !receipt.logs.some(log => log.address.toLowerCase() === manifest.contractAddress))
      throw new BadRequestException("Receipt is not a successful Editions transaction");
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash) throw new BadRequestException("Receipt is not canonical");
    let result = await this.runOnce();
    // A background scan may have started before this transaction was mined.
    if (BigInt(result.blockNumber) < receipt.blockNumber) result = await this.runOnce();
    if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
      throw new BadRequestException("Receipt was reorganized during synchronization");
    return { ...result, txHash, state: "ON_CHAIN_CONFIRMED" };
  }

  runOnce() {
    if (!this.running) this.running = this.sync().finally(() => { this.running = null; });
    return this.running;
  }

  private async sync() {
    const { client, manifest } = this.connected();
    await verifyEditionsDeployment(client, manifest);
    const streamId = this.streamId();
    return this.db.transaction(async tx => {
      // Serialize independent API/worker instances for this exact deployment.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${streamId}))`);
      const head = await client.getBlock({ blockTag: "latest" });
      if (head.number < BigInt(manifest.deploymentBlockNumber)) throw new Error("Editions deployment is outside canonical chain");
      const logs: Log[] = [];
      const seen = new Set<string>();
      // Bounded RPC ranges; replay is deliberate for the small local pilot and reorg recovery.
      for (let from = BigInt(manifest.deploymentBlockNumber); from <= head.number; from += 2000n) {
        const to = from + 1999n < head.number ? from + 1999n : head.number;
        for (const log of await client.getLogs({ address: manifest.contractAddress, fromBlock: from, toBlock: to })) {
          const key = `${log.transactionHash}:${log.logIndex}:${log.blockHash}`;
          if (!seen.has(key)) { logs.push(log); seen.add(key); }
        }
      }
      logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
      const receipts = new Map<string, TransactionReceipt>();
      const blocks = new Map<string, { hash: string; timestamp: bigint }>();
      for (const log of logs) {
        if (log.removed || log.address.toLowerCase() !== manifest.contractAddress || log.blockHash == null || log.blockNumber == null || log.transactionHash == null || log.logIndex == null)
          throw new Error("Invalid Editions log identity");
        if (!blocks.has(log.blockNumber.toString())) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          blocks.set(log.blockNumber.toString(), { hash: block.hash, timestamp: block.timestamp });
        }
        if (blocks.get(log.blockNumber.toString())!.hash !== log.blockHash) throw new Error("Noncanonical Editions log");
        if (!receipts.has(log.transactionHash)) receipts.set(log.transactionHash, await client.getTransactionReceipt({ hash: log.transactionHash }));
        const receipt = receipts.get(log.transactionHash)!;
        if (receipt.status !== "success" || receipt.blockHash !== log.blockHash || receipt.blockNumber !== log.blockNumber ||
          !receipt.logs.some(item => item.logIndex === log.logIndex && item.address.toLowerCase() === manifest.contractAddress && item.data === log.data && item.topics.join() === log.topics.join()))
          throw new Error("Editions log does not match a successful receipt");
      }
      const decoded = parseEventLogs({ abi: editionsAbi, logs, strict: true });
      // No destructive reset: orphaned event/entitlement history is retained but cannot grant access.
      await tx.insert(indexerStreams).values({ streamId, status: "syncing" }).onConflictDoNothing();
      await tx.update(chainEvents).set({ canonical: false }).where(eq(chainEvents.streamId, streamId));
      await tx.update(editionsChainCampaigns).set({ canonical: false }).where(eq(editionsChainCampaigns.streamId, streamId));
      await tx.update(editionsEntitlements).set({ canonical: false }).where(eq(editionsEntitlements.streamId, streamId));
      const bindings = new Map<string, { campaignId: string; snapshot: EditionsChainSnapshot }>();
      const refunded = new Set<string>();
      for (const log of decoded) {
        const args = log.args as Record<string, any>;
        await tx.insert(chainEvents).values({ streamId, transactionHash: log.transactionHash!, logIndex: log.logIndex!, blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(),
          eventName: log.eventName, args: jsonSafe(args), canonical: true })
          .onConflictDoUpdate({ target: [chainEvents.streamId, chainEvents.transactionHash, chainEvents.logIndex, chainEvents.blockHash], set: { canonical: true } });
        if (log.eventName === "Refunded") refunded.add(`${args.campaignId}:${String(args.backer).toLowerCase()}`);
        if (log.eventName !== "CampaignCreated") continue;
        const candidates = await tx.select().from(rewardCampaigns).where(and(eq(rewardCampaigns.commitmentHash, args.commitmentHash), eq(rewardCampaigns.status, "APPROVED")));
        const candidate = candidates.find(item => {
          const frozen = item.frozenSnapshot;
          const releaseAt = frozen ? new Date(frozen.preparation.releaseWindow.end).getTime() : NaN;
          return item.category === "COMICS_ARTBOOK" && frozen && createRewardCampaignDraftSchema.safeParse(frozen.config).success &&
            Number.isSafeInteger(releaseAt) && releaseAt % 1000 === 0 &&
            editionsCommitment(frozen) === args.commitmentHash && frozen.payoutWallet.address === String(args.creator).toLowerCase() &&
            frozen.payoutWallet.chainId === String(manifest.chainId) && frozen.config.goal === String(args.goal) && frozen.config.tiers[0].price === String(args.price) &&
            BigInt(frozen.config.fundingDuration) + blocks.get(log.blockNumber!.toString())!.timestamp === args.fundingDeadline &&
            BigInt(releaseAt / 1000) === args.releaseDeadline;
        });
        if (!candidate) continue;
        const [approval] = await tx.select({ id: rewardReviews.id }).from(rewardReviews).where(and(eq(rewardReviews.campaignId, candidate.id), eq(rewardReviews.commitmentHash, args.commitmentHash), eq(rewardReviews.outcome, "APPROVED")));
        if (!approval) continue;
        const snapshot = jsonSafe<EditionsChainSnapshot>(await client.readContract({ address: manifest.contractAddress, abi: editionsAbi, functionName: "campaign", args: [args.campaignId], blockNumber: head.number }));
        const key = String(args.campaignId);
        bindings.set(key, { campaignId: candidate.id, snapshot });
        await tx.insert(editionsChainCampaigns).values({ streamId, onchainCampaignId: key, campaignId: candidate.id, snapshot, canonical: true })
          .onConflictDoUpdate({ target: [editionsChainCampaigns.streamId, editionsChainCampaigns.onchainCampaignId], set: { campaignId: candidate.id, snapshot, canonical: true } });
      }
      let entitlements = 0;
      for (const log of decoded) {
        if (log.eventName !== "Pledged") continue;
        const args = log.args as Record<string, any>;
        const binding = bindings.get(String(args.campaignId));
        if (!binding || String(args.amount) !== binding.snapshot.price) continue;
        const wallet = String(args.backer).toLowerCase();
        const [link] = await tx.select().from(walletLinks).where(and(eq(walletLinks.chainId, String(manifest.chainId)), eq(walletLinks.address, wallet)));
        const value = { campaignId: binding.campaignId, streamId, chainId: String(manifest.chainId), contractAddress: manifest.contractAddress,
          transactionHash: log.transactionHash!, logIndex: log.logIndex!, blockHash: log.blockHash!, blockNumber: log.blockNumber!.toString(),
          backerWallet: wallet, backerUserId: link?.userId ?? null, amountPaid: String(args.amount), canonical: true, refunded: refunded.has(`${args.campaignId}:${wallet}`) };
        await tx.insert(editionsEntitlements).values(value).onConflictDoUpdate({
          target: [editionsEntitlements.chainId, editionsEntitlements.contractAddress, editionsEntitlements.transactionHash, editionsEntitlements.logIndex],
          set: { ...value, backerUserId: sql`COALESCE(${editionsEntitlements.backerUserId}, ${value.backerUserId})` },
        });
        entitlements++;
      }
      // Re-check the anchored head before committing derived rights. Failure rolls everything back.
      if ((await client.getBlock({ blockNumber: head.number })).hash !== head.hash) throw new Error("Editions chain changed during synchronization");
      await tx.update(indexerStreams).set({ lastBlock: head.number.toString(), lastBlockHash: head.hash, headBlock: head.number.toString(), status: "ready", error: null, updatedAt: new Date() }).where(eq(indexerStreams.streamId, streamId));
      return { blockNumber: head.number.toString(), events: decoded.length, entitlements };
    });
  }
}
