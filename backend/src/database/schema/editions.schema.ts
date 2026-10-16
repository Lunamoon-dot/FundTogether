import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { rewardCampaigns } from "./reward.schema";
import { indexerStreams } from "./indexer.schema";
import { users } from "./users.schema";

export interface EditionsChainSnapshot {
  creator: string; commitmentHash: string; goal: string; price: string; fundingDeadline: string; releaseDeadline: string;
  raised: string; escrowed: string; state: number; productionHash: string; productionApproved: boolean; pdfHash: string;
  releaseEvidenceHash: string; reviewRequestedAt: string; challengeDeadline: string; disputeDeadline: string; openDisputes: string;
}
export const editionsChainCampaigns = pgTable("editions_chain_campaigns", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  snapshot: jsonb("snapshot").$type<EditionsChainSnapshot>().notNull(),
  canonical: boolean("canonical").notNull().default(true),
}, table => [primaryKey({ columns: [table.streamId, table.onchainCampaignId] }), index("editions_chain_campaign_metadata_idx").on(table.campaignId)]);

export const editionsEntitlements = pgTable("editions_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  chainId: varchar("chain_id", { length: 32 }).notNull(),
  contractAddress: varchar("contract_address", { length: 42 }).notNull(),
  transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
  logIndex: integer("log_index").notNull(),
  blockHash: varchar("block_hash", { length: 66 }).notNull(),
  blockNumber: numeric("block_number", { precision: 78, scale: 0 }).notNull(),
  backerWallet: varchar("backer_wallet", { length: 42 }).notNull(),
  backerUserId: uuid("backer_user_id").references(() => users.id),
  amountPaid: numeric("amount_paid", { precision: 78, scale: 0 }).notNull(),
  canonical: boolean("canonical").notNull().default(true),
  refunded: boolean("refunded").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedEvidenceHash: varchar("confirmed_evidence_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("editions_entitlement_log_identity_idx").on(table.chainId, table.contractAddress, table.transactionHash, table.logIndex),
  index("editions_entitlement_owner_idx").on(table.backerUserId), index("editions_entitlement_campaign_idx").on(table.campaignId),
]);

export const editionsEvidence = pgTable("editions_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  purpose: text("purpose").$type<"PRODUCTION_EVIDENCE" | "FINAL_PDF">().notNull(),
  objectId: uuid("object_id").notNull().unique(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  mediaType: text("media_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  summary: text("summary").notNull(),
  productionHash: varchar("production_hash", { length: 66 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 66 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("editions_evidence_identity_idx").on(table.campaignId, table.streamId, table.evidenceHash)]);

export const editionsFeedback = pgTable("editions_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  targetHash: varchar("target_hash", { length: 66 }).notNull(),
  kind: text("kind").$type<"COMMENT" | "ISSUE" | "FILE_UNAVAILABLE">().notNull(),
  body: text("body").notNull(),
  bodyHash: varchar("body_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("editions_feedback_author_target_idx").on(table.campaignId, table.authorUserId, table.targetHash, table.kind, table.bodyHash)]);

export const editionsCreatorResponses = pgTable("editions_creator_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  submissionRevision: integer("submission_revision").notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("editions_creator_response_campaign_idx").on(table.campaignId, table.createdAt),
  uniqueIndex("editions_creator_response_revision_idx").on(table.campaignId, table.submissionRevision),
  check("editions_creator_response_revision_check", sql`${table.submissionRevision} >= 0`),
  check("editions_creator_response_body_check", sql`char_length(btrim(${table.responseBody})) BETWEEN 10 AND 3000`),
]);

export const editionsCreatorResponseFeedback = pgTable("editions_creator_response_feedback", {
  responseId: uuid("response_id").notNull().references(() => editionsCreatorResponses.id, { onDelete: "cascade" }),
  feedbackId: uuid("feedback_id").notNull().references(() => editionsFeedback.id, { onDelete: "cascade" }),
}, table => [
  primaryKey({ columns: [table.responseId, table.feedbackId] }),
  index("editions_creator_response_feedback_feedback_idx").on(table.feedbackId),
]);

export const editionsReviewThreads = pgTable("editions_review_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  entitlementId: uuid("entitlement_id").notNull().references(() => editionsEntitlements.id),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  targetHash: varchar("target_hash", { length: 66 }).notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  status: text("status").$type<"OPEN" | "ESCALATED" | "RESOLVED" | "CLOSED">().notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("editions_review_thread_identity_idx").on(table.campaignId, table.entitlementId, table.targetHash),
  index("editions_review_thread_campaign_idx").on(table.campaignId),
  index("editions_review_thread_backer_idx").on(table.backerUserId),
  index("editions_review_thread_status_idx").on(table.status),
  check("editions_review_thread_status_check", sql`${table.status} IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED')`),
]);

export const editionsReviewMessages = pgTable("editions_review_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => editionsReviewThreads.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  authorRole: text("author_role").$type<"BACKER" | "CREATOR" | "RESOLVER">().notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("editions_review_message_thread_idx").on(table.threadId, table.createdAt),
  check("editions_review_message_author_role_check", sql`${table.authorRole} IN ('BACKER', 'CREATOR', 'RESOLVER')`),
  check("editions_review_message_body_check", sql`char_length(btrim(${table.body})) BETWEEN 1 AND 3000`),
]);

export const editionsReviewEscalations = pgTable("editions_review_escalations", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => editionsReviewThreads.id),
  openerUserId: uuid("opener_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: text("status").$type<"OPEN" | "AWAITING_CREATOR_RESPONSE" | "RESOLVED" | "DISMISSED" | "FORMAL_DISPUTE">().notNull().default("OPEN"),
  resolverUserId: uuid("resolver_user_id").references(() => users.id),
  outcome: text("outcome").$type<"RESOLVED" | "DISMISSED" | "FORMAL_DISPUTE">(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, table => [
  uniqueIndex("editions_review_escalation_thread_idx").on(table.threadId),
  index("editions_review_escalation_status_idx").on(table.status),
  check("editions_review_escalation_status_check", sql`${table.status} IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')`),
  check("editions_review_escalation_outcome_check", sql`${table.outcome} IS NULL OR ${table.outcome} IN ('RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')`),
  check("editions_review_escalation_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 10 AND 3000`),
  check("editions_review_escalation_note_check", sql`${table.note} IS NULL OR char_length(btrim(${table.note})) BETWEEN 10 AND 3000`),
]);

// Temporary access only. The entitlement itself has no expiry; these rows audit requests, not reading/acceptance.
export const editionsDownloadTickets = pgTable("editions_download_tickets", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  entitlementId: uuid("entitlement_id").notNull().references(() => editionsEntitlements.id),
  evidenceId: uuid("evidence_id").notNull().references(() => editionsEvidence.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
});
