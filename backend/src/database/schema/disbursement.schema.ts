import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { campaignMetadata } from "./campaigns.schema";
import { indexerStreams } from "./indexer.schema";
import { users } from "./users.schema";
import type { HedCampaignSnapshot } from "../../disbursement/hed.types";
import type { HedCampaignDraftInput } from "../../disbursement/hed-campaign-draft.schema";
import type { HedRequestDraftInput } from "../../disbursement/hed-request-draft.schema";
import type { HedActivityInput } from "../../disbursement/hed-activity.schema";
import type { HedVendorVerificationInput } from "../../disbursement/hed-vendor-verification.schema";
import type { HedReviewInput } from "../../disbursement/hed-review.schema";
import type { HedEvidencePackageInput } from "../../disbursement/hed-evidence-package.schema";

export const hedCampaignDrafts = pgTable("hed_campaign_drafts", {
  campaignMetadataId: uuid("campaign_metadata_id").primaryKey().references(() => campaignMetadata.id),
  content: jsonb("content").$type<HedCampaignDraftInput>().notNull(),
  goal: numeric("goal", { precision: 78, scale: 0 }).notNull(),
  fundingDuration: integer("funding_duration").notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check("hed_campaign_draft_value_check", sql`${table.goal} > 0 AND ${table.fundingDuration} >= 86400 AND ${table.fundingDuration} <= 2592000`),
  check("hed_campaign_draft_freeze_check", sql`(${table.frozenAt} IS NULL AND ${table.commitmentHash} IS NULL) OR (${table.frozenAt} IS NOT NULL AND ${table.commitmentHash} ~ '^0x[0-9a-f]{64}$' AND ${table.commitmentHash} !~ '^0x0+$')`),
]);

export const hedVendorVerifications = pgTable("hed_vendor_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorWallet: varchar("vendor_wallet", { length: 42 }).notNull(),
  content: jsonb("content").$type<HedVendorVerificationInput>().notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  reportBytes: text("report_bytes").notNull(),
  reportHash: varchar("report_hash", { length: 66 }).notNull().unique(),
  checkedBy: uuid("checked_by").notNull().references(() => users.id),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("hed_vendor_wallet_history_idx").on(table.vendorWallet, table.createdAt),
  check("hed_vendor_verification_status_check", sql`${table.status} IN ('VERIFIED', 'REVOKED')`),
  check("hed_vendor_wallet_check", sql`${table.vendorWallet} ~ '^0x[0-9a-f]{40}$' AND ${table.vendorWallet} !~ '^0x0+$'`),
  check("hed_vendor_report_hash_check", sql`${table.reportHash} ~ '^0x[0-9a-f]{64}$' AND ${table.reportHash} !~ '^0x0+$'`),
]);

export const hedActivities = pgTable("hed_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignMetadataId: uuid("campaign_metadata_id").notNull().references(() => campaignMetadata.id),
  content: jsonb("content").$type<HedActivityInput>().notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }),
  onchainActivityId: numeric("onchain_activity_id", { precision: 78, scale: 0 }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("hed_activity_chain_identity_idx").on(table.campaignMetadataId, table.onchainActivityId),
  check("hed_activity_ceiling_check", sql`(${table.content}->>'ceiling') ~ '^[1-9][0-9]*$'`),
  check("hed_activity_freeze_check", sql`(${table.frozenAt} IS NULL AND ${table.commitmentHash} IS NULL) OR (${table.frozenAt} IS NOT NULL AND ${table.commitmentHash} ~ '^0x[0-9a-f]{64}$' AND ${table.commitmentHash} !~ '^0x0+$')`),
]);

export const hedRequestDrafts = pgTable("hed_request_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignMetadataId: uuid("campaign_metadata_id").notNull().references(() => campaignMetadata.id),
  activityId: uuid("activity_id").references(() => hedActivities.id),
  vendorVerificationId: uuid("vendor_verification_id").notNull().references(() => hedVendorVerifications.id),
  content: jsonb("content").$type<HedRequestDraftInput>().notNull(),
  version: integer("version").notNull().default(1),
  requestHash: varchar("request_hash", { length: 66 }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("hed_request_campaign_idx").on(table.campaignMetadataId, table.createdAt),
  check("hed_request_draft_value_check", sql`${table.version} > 0 AND (${table.content}->>'amount') ~ '^[1-9][0-9]*$' AND (${table.content}->>'deposit') ~ '^(0|[1-9][0-9]*)$' AND ((${table.content}->>'deposit')::numeric <= (${table.content}->>'amount')::numeric)`),
  check("hed_request_draft_freeze_check", sql`(${table.frozenAt} IS NULL AND ${table.requestHash} IS NULL) OR (${table.frozenAt} IS NOT NULL AND ${table.requestHash} ~ '^0x[0-9a-f]{64}$' AND ${table.requestHash} !~ '^0x0+$')`),
]);

export const hedRequestEvidenceDocuments = pgTable("hed_request_evidence_documents", {
  id: uuid("id").primaryKey(),
  requestDraftId: uuid("request_draft_id").notNull().references(() => hedRequestDrafts.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  kind: varchar("kind", { length: 32 }).notNull(),
  originalName: varchar("original_name", { length: 200 }).notNull(),
  mediaType: varchar("media_type", { length: 100 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("hed_request_evidence_idx").on(table.requestDraftId, table.createdAt),
  check("hed_request_evidence_kind_check", sql`${table.kind} IN ('QUOTE', 'NEED', 'TERMS', 'OTHER')`),
  check("hed_request_evidence_size_check", sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`),
  check("hed_request_evidence_hash_check", sql`${table.sha256} ~ '^0x[0-9a-f]{64}$' AND ${table.sha256} !~ '^0x0+$'`),
]);

export const hedRequestReviews = pgTable("hed_request_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestDraftId: uuid("request_draft_id").notNull().references(() => hedRequestDrafts.id),
  content: jsonb("content").$type<HedReviewInput>().notNull(),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("hed_request_review_criterion_version_idx").on(table.requestDraftId, sql`(${table.content}->>'evidenceVersion')`, sql`(${table.content}->>'criterionId')`),
  check("hed_request_review_outcome_check", sql`(${table.content}->>'outcome') IN ('MET','NOT_MET','NEEDS_INFO')`),
]);

export const hedEvidencePackages = pgTable("hed_evidence_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignMetadataId: uuid("campaign_metadata_id").references(() => campaignMetadata.id),
  content: jsonb("content").$type<HedEvidencePackageInput>().notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("hed_evidence_package_manifest_idx").on(sql`(${table.content}->>'manifestHash')`),
  check("hed_evidence_package_kind_check", sql`(${table.content}->>'kind') IN ('DELIVERY','OUTCOME')`),
]);

export const hedEvidenceDocuments = pgTable("hed_evidence_documents", {
  id: uuid("id").primaryKey(),
  campaignMetadataId: uuid("campaign_metadata_id").notNull().references(() => campaignMetadata.id),
  activityId: uuid("activity_id").notNull().references(() => hedActivities.id),
  requestDraftId: uuid("request_draft_id").references(() => hedRequestDrafts.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  kind: varchar("kind", { length: 16 }).notNull(),
  originalName: varchar("original_name", { length: 200 }).notNull(),
  mediaType: varchar("media_type", { length: 100 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("hed_evidence_document_scope_idx").on(table.campaignMetadataId, table.activityId, table.createdAt),
  check("hed_evidence_document_kind_check", sql`${table.kind} IN ('DELIVERY', 'OUTCOME')`),
  check("hed_evidence_document_size_check", sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`),
  check("hed_evidence_document_hash_check", sql`${table.sha256} ~ '^0x[0-9a-f]{64}$' AND ${table.sha256} !~ '^0x0+$'`),
]);

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
  requestDraftId: uuid("request_draft_id").references(() => hedRequestDrafts.id),
  onchainRequestId: numeric("onchain_request_id", { precision: 78, scale: 0 }),
  requestVersion: integer("request_version").notNull(),
  requestHash: varchar("request_hash", { length: 66 }).notNull(),
  vendorWallet: varchar("vendor_wallet", { length: 42 }).notNull(),
  amount: numeric("amount", { precision: 78, scale: 0 }).notNull(),
  deposit: numeric("deposit", { precision: 78, scale: 0 }).notNull(),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("disbursement_request_draft_identity_idx").on(table.requestDraftId),
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
