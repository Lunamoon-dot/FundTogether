import { boolean, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { CampaignSnapshot } from '../../blockchain/blockchain.service';

export const indexerStreams = pgTable('indexer_streams', {
  streamId: text('stream_id').primaryKey(),
  lastBlock: numeric('last_block', { precision: 78, scale: 0 }),
  lastBlockHash: varchar('last_block_hash', { length: 66 }),
  headBlock: numeric('head_block', { precision: 78, scale: 0 }),
  status: varchar('status', { length: 20 }).default('syncing').notNull(),
  error: text('error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chainEvents = pgTable('chain_events', {
  streamId: text('stream_id').notNull().references(() => indexerStreams.streamId),
  transactionHash: varchar('transaction_hash', { length: 66 }).notNull(),
  logIndex: integer('log_index').notNull(),
  blockHash: varchar('block_hash', { length: 66 }).notNull(),
  blockNumber: numeric('block_number', { precision: 78, scale: 0 }).notNull(),
  eventName: varchar('event_name', { length: 100 }).notNull(),
  args: jsonb('args').$type<Record<string, unknown>>().notNull(),
  canonical: boolean('canonical').default(true).notNull(),
}, table => [primaryKey({ columns: [table.streamId, table.transactionHash, table.logIndex, table.blockHash] })]);

export const campaignChainProjection = pgTable('campaign_chain_projection', {
  streamId: text('stream_id').notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric('onchain_campaign_id', { precision: 78, scale: 0 }).notNull(),
  // Derived association, revalidated through the organizer-scoped on-chain draft key.
  metadataId: uuid('metadata_id'),
  snapshot: jsonb('snapshot').$type<CampaignSnapshot>().notNull(),
}, table => [primaryKey({ columns: [table.streamId, table.onchainCampaignId] })]);
