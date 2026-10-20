import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { indexerStreams } from "./indexer.schema";

export const vnextChainEvents = pgTable("vnext_chain_events", {
  // Encoded as vnext:<chainId>:<campaignEscrowAddress>:<genesisHash>. The
  // deployment identity is part of every event key so a database projection
  // cannot silently mix two chains, redeployments, or genesis histories.
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
  logIndex: integer("log_index").notNull(),
  blockHash: varchar("block_hash", { length: 66 }).notNull(),
  blockNumber: numeric("block_number", { precision: 78, scale: 0 }).notNull(),
  eventName: varchar("event_name", { length: 100 }).notNull(),
  args: jsonb("args").$type<Record<string, unknown>>().notNull(),
  canonical: boolean("canonical").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.streamId, table.transactionHash, table.logIndex] }),
  uniqueIndex("vnext_chain_event_block_identity_idx").on(
    table.streamId,
    table.blockHash,
    table.logIndex,
  ),
  uniqueIndex("vnext_chain_event_canonical_identity_idx").on(
    table.streamId,
    table.transactionHash,
    table.logIndex,
    table.canonical,
  ),
]);

export const vnextCampaignProjections = pgTable("vnext_campaign_projections", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  creator: varchar("creator", { length: 42 }).notNull(),
  payoutWallet: varchar("payout_wallet", { length: 42 }).notNull(),
  termsHash: varchar("terms_hash", { length: 66 }).notNull(),
  publicationEvidenceHash: varchar("publication_evidence_hash", { length: 66 }),
  publicationReviewCaseId: varchar("publication_review_case_id", { length: 66 }),
  publicationOutcome: integer("publication_outcome"),
  policyVersion: numeric("policy_version", { precision: 78, scale: 0 }).notNull(),
  goal: numeric("goal", { precision: 78, scale: 0 }).notNull(),
  fundingDeadline: numeric("funding_deadline", { precision: 78, scale: 0 }).notNull(),
  raised: numeric("raised", { precision: 78, scale: 0 }).notNull().default("0"),
  paidOut: numeric("paid_out", { precision: 78, scale: 0 }).notNull().default("0"),
  refunded: numeric("refunded", { precision: 78, scale: 0 }).notNull().default("0"),
  state: integer("state").notNull(),
  lastBlockNumber: numeric("last_block_number", { precision: 78, scale: 0 }).notNull(),
  lastEventName: varchar("last_event_name", { length: 100 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.streamId, table.onchainCampaignId] }),
  uniqueIndex("vnext_campaign_terms_hash_idx").on(table.streamId, table.termsHash),
]);

export const vnextMilestoneProjections = pgTable("vnext_milestone_projections", {
  streamId: text("stream_id").notNull(),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  milestoneId: integer("milestone_id").notNull(),
  budget: numeric("budget", { precision: 78, scale: 0 }),
  acceptanceCriteriaHash: varchar("acceptance_criteria_hash", { length: 66 }),
  evidenceRevision: numeric("evidence_revision", { precision: 78, scale: 0 }).notNull().default("0"),
  evidenceHash: varchar("evidence_hash", { length: 66 }),
  reviewCaseId: varchar("review_case_id", { length: 66 }),
  finalOutcome: integer("final_outcome"),
  submissionDeadline: numeric("submission_deadline", { precision: 78, scale: 0 }),
  correctionDeadline: numeric("correction_deadline", { precision: 78, scale: 0 }),
  challengeDeadline: numeric("challenge_deadline", { precision: 78, scale: 0 }),
  state: integer("state").notNull(),
  paid: boolean("paid").notNull().default(false),
  lastBlockNumber: numeric("last_block_number", { precision: 78, scale: 0 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.streamId, table.onchainCampaignId, table.milestoneId] }),
  uniqueIndex("vnext_milestone_review_case_idx").on(table.streamId, table.reviewCaseId),
]);

export const vnextReviewProjections = pgTable("vnext_review_projections", {
  streamId: text("stream_id").notNull(),
  reviewCaseId: varchar("review_case_id", { length: 66 }).notNull(),
  rootCaseId: varchar("root_case_id", { length: 66 }).notNull(),
  campaignId: numeric("campaign_id", { precision: 78, scale: 0 }).notNull(),
  milestoneId: numeric("milestone_id", { precision: 78, scale: 0 }).notNull(),
  evidenceRevision: numeric("evidence_revision", { precision: 78, scale: 0 }).notNull(),
  roundId: numeric("round_id", { precision: 78, scale: 0 }).notNull(),
  creator: varchar("creator", { length: 42 }).notNull(),
  enrolledCount: numeric("enrolled_count", { precision: 78, scale: 0 }).notNull().default("0"),
  outcome: integer("outcome"),
  finalized: boolean("finalized").notNull().default(false),
  lastBlockNumber: numeric("last_block_number", { precision: 78, scale: 0 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.streamId, table.reviewCaseId] }),
]);

export const vnextJudgeAssignments = pgTable("vnext_judge_assignments", {
  streamId: text("stream_id").notNull(),
  reviewCaseId: varchar("review_case_id", { length: 66 }).notNull(),
  roundId: numeric("round_id", { precision: 78, scale: 0 }).notNull(),
  courtId: numeric("court_id", { precision: 78, scale: 0 }).notNull(),
  slot: integer("slot").notNull(),
  judgeAddress: varchar("judge_address", { length: 42 }).notNull(),
  lastBlockNumber: numeric("last_block_number", { precision: 78, scale: 0 }).notNull(),
}, table => [
  primaryKey({ columns: [table.streamId, table.reviewCaseId, table.courtId, table.slot] }),
  uniqueIndex("vnext_judge_assignment_address_idx").on(
    table.streamId,
    table.reviewCaseId,
    table.judgeAddress,
  ),
]);
