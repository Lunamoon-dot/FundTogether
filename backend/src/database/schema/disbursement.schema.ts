import { sql } from "drizzle-orm";
import { check, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { campaignMetadata } from "./campaigns.schema";
import { indexerStreams } from "./indexer.schema";
import { users } from "./users.schema";
import type { HedCampaignSnapshot } from "../../disbursement/hed.types";

export const disbursementCampaigns = pgTable("disbursement_campaigns", {
  campaignMetadataId: uuid("campaign_metadata_id").primaryKey().references(() => campaignMetadata.id),
  chainId: integer("chain_id").notNull(),
  deploymentId: varchar("deployment_id", { length: 66 }).notNull(),
  contractAddress: varchar("contract_address", { length: 42 }).notNull(),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }),
  commitmentHash: varchar("commitment_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("disbursement_campaign_identity_idx").on(table.chainId, table.deploymentId, table.contractAddress, table.onchainCampaignId),
  check("disbursement_campaign_identity_check", sql`${table.chainId} > 0 AND ${table.deploymentId} ~ '^0x[0-9a-f]{64}$' AND ${table.contractAddress} ~ '^0x[0-9a-f]{40}$'`),
]);

export const disbursementRequests = pgTable("disbursement_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignMetadataId: uuid("campaign_metadata_id").notNull().references(() => disbursementCampaigns.campaignMetadataId),
  onchainRequestId: numeric("onchain_request_id", { precision: 78, scale: 0 }),
  requestVersion: integer("request_version").notNull(),
  requestHash: varchar("request_hash", { length: 66 }).notNull(),
  vendorWallet: varchar("vendor_wallet", { length: 42 }).notNull(),
  amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
  deposit: numeric("deposit", { precision: 78, scale: 0 }).notNull(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("disbursement_request_version_idx").on(table.campaignMetadataId, table.onchainRequestId, table.requestVersion),
  check("disbursement_request_values_check", sql`${table.requestVersion} > 0 AND ${table.amount} > 0 AND ${table.deposit} >= 0 AND ${table.deposit} <= ${table.amount}`),
]);

export const disbursementReviewRecords = pgTable("disbursement_review_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => disbursementRequests.id),
  evidenceVersion: integer("evidence_version").notNull(),
  criterionId: varchar("criterion_id", { length: 32 }).notNull(),
  outcome: varchar("outcome", { length: 16 }).notNull(),
  reasonCode: varchar("reason_code", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  manifestHash: varchar("manifest_hash", { length: 66 }).notNull(),
  publicHash: varchar("public_hash", { length: 66 }),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("disbursement_review_criterion_version_idx").on(table.requestId, table.evidenceVersion, table.criterionId),
  check("disbursement_review_outcome_check", sql`${table.outcome} IN ('MET', 'NOT_MET', 'NEEDS_INFO') AND ${table.evidenceVersion} > 0`),
]);

export const disbursementCampaignProjection = pgTable("disbursement_campaign_projection", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  metadataId: uuid("metadata_id").references(() => campaignMetadata.id),
  snapshot: jsonb("snapshot").$type<HedCampaignSnapshot>().notNull(),
}, table => [
  primaryKey({ columns: [table.streamId, table.onchainCampaignId] }),
  check("disbursement_projection_id_check", sql`${table.onchainCampaignId} >= 0 AND ${table.onchainCampaignId} <= 115792089237316195423570985008687907853269984665640564039457584007913129639935`),
]);
