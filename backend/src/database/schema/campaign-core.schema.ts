import { pgTable, uuid, varchar, text, integer, numeric, timestamp, boolean, jsonb, primaryKey, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, walletLinks } from "./users.schema";
import { indexerStreams } from "./indexer.schema";
import type { CreateCampaignDraftInput } from "../../modules/campaigns/schemas/campaign.schema";
import type { CampaignPreparation } from "../../modules/campaigns/schemas/preparation.schema";
import type { CampaignSnapshot } from "../../modules/campaigns/policies/commitment";

export const creatorProfiles = pgTable("campaigns_creator_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  bio: text("bio").notNull(),
  ipDeclaration: text("ip_declaration").notNull(),
  primaryGenre: varchar("primary_genre", { length: 100 }),
  portfolioUrl: varchar("portfolio_url", { length: 500 }),
  socialUrl: varchar("social_url", { length: 500 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  originalWorkPledge: boolean("original_work_pledge"),
  studioWalletLinkId: uuid("studio_wallet_link_id").references(() => walletLinks.id),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("campaign_creator_profile_user_idx").on(table.userId),
  check("campaigns_creator_profile_status_check", sql`${table.status} IN ('PENDING', 'VERIFIED', 'REJECTED')`),
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  title: varchar("title", { length: 200 }).notNull(),
  pitch: varchar("pitch", { length: 500 }).notNull(),
  story: text("story").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("COMICS"),
  commitmentHash: varchar("commitment_hash", { length: 66 }),
  goal: numeric("goal", { precision: 78, scale: 0 }).notNull(),
  fundingDuration: integer("funding_duration").notNull().default(2592000), // 30 days
  policyHash: varchar("policy_hash", { length: 66 }),
  draftConfig: jsonb("draft_config").$type<CreateCampaignDraftInput>(),
  reviewPreparation: jsonb("review_preparation").$type<CampaignPreparation>(),
  frozenSnapshot: jsonb("frozen_snapshot").$type<CampaignSnapshot>(),
  revision: integer("revision").notNull().default(0),
  payoutWalletLinkId: uuid("payout_wallet_link_id").references(() => walletLinks.id),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("campaign_creator_idx").on(table.creatorUserId),
  index("campaign_status_idx").on(table.status),
  check("campaign_goal_check", sql`${table.goal} > 0`),
  check("campaign_revision_check", sql`${table.revision} >= 0`),
  check("campaign_policy_check", sql`${table.policyHash} IS NOT NULL OR (${table.draftConfig} IS NOT NULL AND ${table.category} = 'COMICS_ARTBOOK')`),
  check("campaign_status_check", sql`${table.status} IN ('DRAFT', 'FROZEN', 'UNDER_REVIEW', 'UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE', 'COMPLETED', 'STOPPED')`),
]);

export const campaignReviews = pgTable("campaigns_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  resolverUserId: uuid("resolver_user_id").notNull().references(() => users.id),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  decisionReason: text("decision_reason").notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  frozenSnapshot: jsonb("frozen_snapshot").$type<CampaignSnapshot>(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("campaign_review_campaign_idx").on(table.campaignId),
  check("campaign_review_outcome_check", sql`${table.outcome} IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED')`),
]);

export const campaignSamples = pgTable("campaigns_samples", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  objectId: uuid("object_id").notNull().unique(),
  sha256: varchar("sha256", { length: 66 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  purpose: varchar("purpose", { length: 32 }).notNull().default("SAMPLE_PAGE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("campaigns_sample_campaign_idx").on(table.campaignId),
  check("campaigns_sample_media_check", sql`${table.mediaType} IN ('application/pdf', 'image/png', 'image/jpeg')`),
  check("campaigns_sample_size_check", sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 10485760`),
  check("campaigns_sample_purpose_check", sql`${table.purpose} = 'SAMPLE_PAGE'`),
]);

export const campaignTiers = pgTable("campaigns_tiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  tierIndex: integer("tier_index").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 78, scale: 0 }).notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  pledgedQuantity: integer("pledged_quantity").notNull().default(0),
  isDigital: boolean("is_digital").notNull().default(false),
  benefitItems: jsonb("benefit_items").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("campaign_tier_campaign_index_idx").on(table.campaignId, table.tierIndex),
  check("campaign_tier_price_check", sql`${table.price} > 0`),
  check("campaign_tier_qty_check", sql`${table.maxQuantity} > 0 AND ${table.pledgedQuantity} >= 0 AND ${table.pledgedQuantity} <= ${table.maxQuantity}`),
]);

export const historicalEntitlements = pgTable("historical_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  tierId: uuid("tier_id").notNull().references(() => campaignTiers.id),
  onchainTierIndex: integer("onchain_tier_index"),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  backerWallet: varchar("backer_wallet", { length: 42 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  amountPaid: numeric("amount_paid", { precision: 78, scale: 0 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  logIndex: integer("log_index"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING_FUNDING"),
  digitalAccessCode: varchar("digital_access_code", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("historical_entitlement_campaign_idx").on(table.campaignId),
  index("historical_entitlement_backer_idx").on(table.backerUserId),
  index("historical_entitlement_tx_hash_idx").on(table.txHash),
  uniqueIndex("historical_entitlements_tx_log_idx").on(table.txHash, table.logIndex),
  check("historical_entitlement_status_check", sql`${table.status} IN ('PENDING_FUNDING', 'ACTIVE', 'REDEEM_REQUESTED', 'FULFILLING', 'DELIVERED', 'CONFIRMED', 'DISPUTED', 'REFUND_ELIGIBLE', 'REFUNDED')`),
]);

export const historicalDisputes = pgTable("historical_disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  entitlementId: uuid("entitlement_id").notNull().references(() => historicalEntitlements.id),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidenceHash: varchar("evidence_hash", { length: 66 }),
  status: varchar("status", { length: 32 }).notNull().default("OPEN"),
  resolutionNote: text("resolution_note"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("historical_dispute_entitlement_idx").on(table.entitlementId),
  uniqueIndex("historical_dispute_one_open_idx").on(table.entitlementId).where(sql`${table.status} = 'OPEN'`),
  index("historical_dispute_status_idx").on(table.status),
  check("historical_dispute_status_check", sql`${table.status} IN ('OPEN', 'RESOLVED_CREATOR', 'RESOLVED_BACKER', 'DISMISSED')`),
]);

export const historicalCampaignProjection = pgTable("historical_campaign_projection", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  campaignMetadataId: uuid("campaign_metadata_id").references(() => campaigns.id),
  snapshot: jsonb("snapshot").notNull(),
}, table => [
  primaryKey({ columns: [table.streamId, table.onchainCampaignId] }),
]);
