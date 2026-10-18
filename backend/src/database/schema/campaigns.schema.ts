import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { campaigns } from "./campaign-core.schema";
import { indexerStreams } from "./indexer.schema";
import { users } from "./users.schema";

export interface CampaignChainSnapshot {
  creator: string; commitmentHash: string; goal: string; price: string; fundingDeadline: string; releaseDeadline: string;
  raised: string; escrowed: string; state: number; productionHash: string; productionApproved: boolean; pdfHash: string;
  releaseEvidenceHash: string; reviewRequestedAt: string; challengeDeadline: string; disputeDeadline: string; openDisputes: string;
  payoutRequestHash: string; payoutAmount: string; payoutRequestedAt: string; payoutDecisionHash: string; creatorPaid: string;
  completionRequestHash: string; completionRequestedAt: string; completionDecisionHash: string;
  completionRaised: string; surplusPool: string; surplusClaimed: string; backerCount: string; surplusClaimantCount: string;
}
export const campaignChainCampaigns = pgTable("campaigns_chain_campaigns", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  snapshot: jsonb("snapshot").$type<CampaignChainSnapshot>().notNull(),
  canonical: boolean("canonical").notNull().default(true),
}, table => [primaryKey({ columns: [table.streamId, table.onchainCampaignId] }), index("campaigns_chain_campaign_metadata_idx").on(table.campaignId)]);

export const campaignEntitlements = pgTable("campaigns_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
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
  quantity: numeric("quantity", { precision: 78, scale: 0 }).notNull().default("1"),
  canonical: boolean("canonical").notNull().default(true),
  refunded: boolean("refunded").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedEvidenceHash: varchar("confirmed_evidence_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_entitlement_log_identity_idx").on(table.chainId, table.contractAddress, table.transactionHash, table.logIndex),
  index("campaigns_entitlement_owner_idx").on(table.backerUserId), index("campaigns_entitlement_campaign_idx").on(table.campaignId),
]);

export const campaignEvidence = pgTable("campaigns_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
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
}, table => [uniqueIndex("campaigns_evidence_identity_idx").on(table.campaignId, table.streamId, table.evidenceHash)]);

export type CampaignPayoutRequestStatus =
  | "DRAFT"
  | "SUBMITTED_ON_CHAIN"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "APPROVED"
  | "PAID_OUT";

export type CampaignPayoutFilePurpose = "USE_EXPLANATION" | "PREVIOUS_USE_EVIDENCE";

export const campaignPayoutRequests = pgTable("campaigns_payout_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  revision: integer("revision").notNull(),
  requestHash: varchar("request_hash", { length: 66 }).notNull(),
  amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary").notNull(),
  reason: text("reason").notNull(),
  breakdown: text("breakdown").notNull(),
  status: text("status").$type<CampaignPayoutRequestStatus>().notNull().default("DRAFT"),
  requestTxHash: varchar("request_tx_hash", { length: 66 }),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  decisionHash: varchar("decision_hash", { length: 66 }),
  decisionTxHash: varchar("decision_tx_hash", { length: 66 }),
  paidOutTxHash: varchar("paid_out_tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_payout_request_revision_idx").on(table.campaignId, table.streamId, table.revision),
  uniqueIndex("campaigns_payout_request_hash_idx").on(table.campaignId, table.streamId, table.requestHash),
  index("campaigns_payout_request_campaign_idx").on(table.campaignId, table.createdAt),
  check("campaigns_payout_request_revision_check", sql`${table.revision} >= 1`),
  check("campaigns_payout_request_amount_check", sql`${table.amount} > 0`),
  check("campaigns_payout_request_status_check", sql`${table.status} IN ('DRAFT', 'SUBMITTED_ON_CHAIN', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'PAID_OUT')`),
]);

export const campaignPayoutRequestFiles = pgTable("campaigns_payout_request_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => campaignPayoutRequests.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<CampaignPayoutFilePurpose>().notNull(),
  objectId: uuid("object_id").notNull().unique(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("campaigns_payout_request_file_request_idx").on(table.requestId),
  check("campaigns_payout_request_file_purpose_check", sql`${table.purpose} IN ('USE_EXPLANATION', 'PREVIOUS_USE_EVIDENCE')`),
  check("campaigns_payout_request_file_media_check", sql`${table.mediaType} IN ('application/pdf', 'image/png', 'image/jpeg')`),
  check("campaigns_payout_request_file_size_check", sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 10485760`),
]);

export type CampaignPayoutDecisionOutcome = "APPROVE" | "CHANGES_REQUESTED" | "REJECT";

export const campaignPayoutDecisions = pgTable("campaigns_payout_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => campaignPayoutRequests.id),
  resolverUserId: uuid("resolver_user_id").notNull().references(() => users.id),
  outcome: text("outcome").$type<CampaignPayoutDecisionOutcome>().notNull(),
  reason: text("reason").notNull(),
  decisionHash: varchar("decision_hash", { length: 66 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_payout_decision_hash_idx").on(table.requestId, table.decisionHash),
  index("campaigns_payout_decision_request_idx").on(table.requestId, table.createdAt),
  check("campaigns_payout_decision_outcome_check", sql`${table.outcome} IN ('APPROVE', 'CHANGES_REQUESTED', 'REJECT')`),
  check("campaigns_payout_decision_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 10 AND 3000`),
]);

export type CampaignCompletionRequestStatus =
  | "DRAFT"
  | "SUBMITTED_ON_CHAIN"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "APPROVED";

export const campaignCompletionRequests = pgTable("campaigns_completion_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  revision: integer("revision").notNull(),
  requestHash: varchar("request_hash", { length: 66 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<CampaignCompletionRequestStatus>().notNull().default("DRAFT"),
  requestTxHash: varchar("request_tx_hash", { length: 66 }),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  decisionHash: varchar("decision_hash", { length: 66 }),
  decisionTxHash: varchar("decision_tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_completion_request_revision_idx").on(table.campaignId, table.streamId, table.revision),
  uniqueIndex("campaigns_completion_request_hash_idx").on(table.campaignId, table.streamId, table.requestHash),
  index("campaigns_completion_request_campaign_idx").on(table.campaignId, table.createdAt),
  check("campaigns_completion_request_revision_check", sql`${table.revision} >= 1`),
  check("campaigns_completion_request_status_check", sql`${table.status} IN ('DRAFT', 'SUBMITTED_ON_CHAIN', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED')`),
]);

export const campaignCompletionRequestFiles = pgTable("campaigns_completion_request_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => campaignCompletionRequests.id, { onDelete: "cascade" }),
  objectId: uuid("object_id").notNull().unique(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("campaigns_completion_request_file_request_idx").on(table.requestId),
  check("campaigns_completion_request_file_media_check", sql`${table.mediaType} IN ('application/pdf', 'image/png', 'image/jpeg')`),
  check("campaigns_completion_request_file_size_check", sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 10485760`),
]);

export type CampaignCompletionDecisionOutcome = "APPROVE" | "CHANGES_REQUESTED" | "REJECT";

export const campaignCompletionDecisions = pgTable("campaigns_completion_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => campaignCompletionRequests.id),
  resolverUserId: uuid("resolver_user_id").notNull().references(() => users.id),
  outcome: text("outcome").$type<CampaignCompletionDecisionOutcome>().notNull(),
  reason: text("reason").notNull(),
  decisionHash: varchar("decision_hash", { length: 66 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_completion_decision_hash_idx").on(table.requestId, table.decisionHash),
  index("campaigns_completion_decision_request_idx").on(table.requestId, table.createdAt),
  check("campaigns_completion_decision_outcome_check", sql`${table.outcome} IN ('APPROVE', 'CHANGES_REQUESTED', 'REJECT')`),
  check("campaigns_completion_decision_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 10 AND 3000`),
]);

export type CampaignSurplusChoice = "REFUND_TO_BACKER" | "DONATE_TO_CREATOR";

export const campaignSurplusClaims = pgTable("campaigns_surplus_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  backerUserId: uuid("backer_user_id").references(() => users.id),
  backerWallet: varchar("backer_wallet", { length: 42 }).notNull(),
  choice: text("choice").$type<CampaignSurplusChoice>().notNull(),
  recipient: varchar("recipient", { length: 42 }).notNull(),
  amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
  transactionHash: varchar("transaction_hash", { length: 66 }).notNull(),
  logIndex: integer("log_index").notNull(),
  blockHash: varchar("block_hash", { length: 66 }).notNull(),
  blockNumber: numeric("block_number", { precision: 78, scale: 0 }).notNull(),
  canonical: boolean("canonical").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_surplus_claim_log_identity_idx").on(table.streamId, table.transactionHash, table.logIndex),
  index("campaigns_surplus_claim_campaign_idx").on(table.campaignId, table.createdAt),
  check("campaigns_surplus_claim_choice_check", sql`${table.choice} IN ('REFUND_TO_BACKER', 'DONATE_TO_CREATOR')`),
  check("campaigns_surplus_claim_amount_check", sql`${table.amount} > 0`),
]);

export const campaignFeedback = pgTable("campaigns_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  targetHash: varchar("target_hash", { length: 66 }).notNull(),
  kind: text("kind").$type<"COMMENT" | "ISSUE" | "FILE_UNAVAILABLE">().notNull(),
  body: text("body").notNull(),
  bodyHash: varchar("body_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("campaigns_feedback_author_target_idx").on(table.campaignId, table.authorUserId, table.targetHash, table.kind, table.bodyHash)]);

export const creatorResponses = pgTable("campaigns_creator_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  submissionRevision: integer("submission_revision").notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("campaigns_creator_response_campaign_idx").on(table.campaignId, table.createdAt),
  uniqueIndex("campaigns_creator_response_revision_idx").on(table.campaignId, table.submissionRevision),
  check("campaigns_creator_response_revision_check", sql`${table.submissionRevision} >= 0`),
  check("campaigns_creator_response_body_check", sql`char_length(btrim(${table.responseBody})) BETWEEN 10 AND 3000`),
]);

export const creatorResponseFeedback = pgTable("campaigns_creator_response_feedback", {
  responseId: uuid("response_id").notNull().references(() => creatorResponses.id, { onDelete: "cascade" }),
  feedbackId: uuid("feedback_id").notNull().references(() => campaignFeedback.id, { onDelete: "cascade" }),
}, table => [
  primaryKey({ columns: [table.responseId, table.feedbackId] }),
  index("campaigns_creator_response_feedback_feedback_idx").on(table.feedbackId),
]);

export const reviewThreads = pgTable("campaigns_review_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  entitlementId: uuid("entitlement_id").notNull().references(() => campaignEntitlements.id),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  targetHash: varchar("target_hash", { length: 66 }).notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  status: text("status").$type<"OPEN" | "ESCALATED" | "RESOLVED" | "CLOSED">().notNull().default("OPEN"),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("campaigns_review_thread_identity_idx").on(table.campaignId, table.entitlementId, table.targetHash),
  index("campaigns_review_thread_campaign_idx").on(table.campaignId),
  index("campaigns_review_thread_backer_idx").on(table.backerUserId),
  index("campaigns_review_thread_status_idx").on(table.status),
  check("campaigns_review_thread_status_check", sql`${table.status} IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED')`),
  check("campaigns_review_thread_message_count_check", sql`${table.messageCount} BETWEEN 0 AND 200`),
]);

export const reviewMessages = pgTable("campaigns_review_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => reviewThreads.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  authorRole: text("author_role").$type<"BACKER" | "CREATOR" | "RESOLVER">().notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("campaigns_review_message_thread_idx").on(table.threadId, table.createdAt),
  index("campaigns_review_message_thread_cursor_idx").on(table.threadId, table.createdAt, table.id),
  check("campaigns_review_message_author_role_check", sql`${table.authorRole} IN ('BACKER', 'CREATOR', 'RESOLVER')`),
  check("campaigns_review_message_body_check", sql`char_length(btrim(${table.body})) BETWEEN 1 AND 3000`),
]);

export const reviewEscalations = pgTable("campaigns_review_escalations", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => reviewThreads.id),
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
  uniqueIndex("campaigns_review_escalation_thread_idx").on(table.threadId),
  index("campaigns_review_escalation_status_idx").on(table.status),
  check("campaigns_review_escalation_status_check", sql`${table.status} IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')`),
  check("campaigns_review_escalation_outcome_check", sql`${table.outcome} IS NULL OR ${table.outcome} IN ('RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')`),
  check("campaigns_review_escalation_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 10 AND 3000`),
  check("campaigns_review_escalation_note_check", sql`${table.note} IS NULL OR char_length(btrim(${table.note})) BETWEEN 10 AND 3000`),
]);

// Temporary access only. The entitlement itself has no expiry; these rows audit requests, not reading/acceptance.
export const downloadTickets = pgTable("campaigns_download_tickets", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  entitlementId: uuid("entitlement_id").notNull().references(() => campaignEntitlements.id),
  evidenceId: uuid("evidence_id").notNull().references(() => campaignEvidence.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
});
