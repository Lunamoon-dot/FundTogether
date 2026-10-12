import { pgTable, uuid, varchar, text, integer, numeric, timestamp, boolean, jsonb, primaryKey, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.schema";
import { organizations } from "./organizations.schema";
import { indexerStreams } from "./indexer.schema";

export const rewardCreatorProfiles = pgTable("reward_creator_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  bio: text("bio").notNull(),
  ipDeclaration: text("ip_declaration").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("reward_creator_profile_user_idx").on(table.userId),
  check("reward_creator_profile_status_check", sql`${table.status} IN ('PENDING', 'VERIFIED', 'REJECTED')`),
]);

export const rewardCampaigns = pgTable("reward_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  title: varchar("title", { length: 200 }).notNull(),
  pitch: varchar("pitch", { length: 500 }).notNull(),
  story: text("story").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("COMICS"),
  commitmentHash: varchar("commitment_hash", { length: 66 }),
  goal: numeric("goal", { precision: 78, scale: 0 }).notNull(),
  fundingDuration: integer("funding_duration").notNull().default(2592000), // 30 days
  policyHash: varchar("policy_hash", { length: 66 }).notNull(),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("reward_campaign_creator_idx").on(table.creatorUserId),
  index("reward_campaign_status_idx").on(table.status),
  check("reward_campaign_goal_check", sql`${table.goal} > 0`),
  check("reward_campaign_status_check", sql`${table.status} IN ('DRAFT', 'FROZEN', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE', 'COMPLETED', 'STOPPED')`),
]);

export const rewardReviews = pgTable("reward_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  resolverUserId: uuid("resolver_user_id").notNull().references(() => users.id),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  decisionReason: text("decision_reason").notNull(),
  commitmentHash: varchar("commitment_hash", { length: 66 }).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("reward_review_campaign_idx").on(table.campaignId),
  check("reward_review_outcome_check", sql`${table.outcome} IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED')`),
]);

export const rewardTiers = pgTable("reward_tiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  tierIndex: integer("tier_index").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  description: text("description").notNull(),
  price: numeric("price", { precision: 78, scale: 0 }).notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  pledgedQuantity: integer("pledged_quantity").notNull().default(0),
  isDigital: boolean("is_digital").notNull().default(false),
  rewardItems: jsonb("reward_items").notNull().default([]),
  estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("reward_tier_campaign_index_idx").on(table.campaignId, table.tierIndex),
  check("reward_tier_price_check", sql`${table.price} > 0`),
  check("reward_tier_qty_check", sql`${table.maxQuantity} > 0 AND ${table.pledgedQuantity} >= 0 AND ${table.pledgedQuantity} <= ${table.maxQuantity}`),
]);

export const rewardEntitlements = pgTable("reward_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  tierId: uuid("tier_id").notNull().references(() => rewardTiers.id),
  onchainTierIndex: integer("onchain_tier_index"),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  backerWallet: varchar("backer_wallet", { length: 42 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  amountPaid: numeric("amount_paid", { precision: 78, scale: 0 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  logIndex: integer("log_index"),
  status: varchar("status", { length: 32 }).notNull().default("PENDING_FUNDING"),
  digitalAccessCode: varchar("digital_access_code", { length: 100 }),
  // Encrypted PII shipping details (AES-256-GCM)
  shippingEncrypted: text("shipping_encrypted"),
  shippingIv: varchar("shipping_iv", { length: 64 }),
  shippingTag: varchar("shipping_tag", { length: 64 }),
  shippingUpdatedAt: timestamp("shipping_updated_at", { withTimezone: true }),
  // Plaintext convenience fields for backwards compatibility
  shippingFullName: varchar("shipping_full_name", { length: 150 }),
  shippingAddress: text("shipping_address"),
  shippingPhone: varchar("shipping_phone", { length: 50 }),
  carrierTrackingCode: varchar("carrier_tracking_code", { length: 100 }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("reward_entitlement_campaign_idx").on(table.campaignId),
  index("reward_entitlement_backer_idx").on(table.backerUserId),
  index("reward_entitlement_tx_hash_idx").on(table.txHash),
  uniqueIndex("reward_entitlements_tx_log_idx").on(table.txHash, table.logIndex),
  check("reward_entitlement_status_check", sql`${table.status} IN ('PENDING_FUNDING', 'ACTIVE', 'REDEEM_REQUESTED', 'FULFILLING', 'DELIVERED', 'CONFIRMED', 'DISPUTED', 'REFUND_ELIGIBLE', 'REFUNDED')`),
]);

export const rewardFulfillmentBatches = pgTable("reward_fulfillment_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => rewardCampaigns.id),
  batchNumber: integer("batch_number").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  carrier: varchar("carrier", { length: 100 }).notNull(),
  manifestHash: varchar("manifest_hash", { length: 66 }).notNull(),
  shippedItemCount: integer("shipped_item_count").notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("reward_batch_campaign_idx").on(table.campaignId, table.batchNumber),
]);

export const rewardBatchEntitlements = pgTable("reward_batch_entitlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => rewardFulfillmentBatches.id),
  entitlementId: uuid("entitlement_id").notNull().references(() => rewardEntitlements.id),
  carrierTrackingCode: varchar("carrier_tracking_code", { length: 100 }).notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("reward_batch_entitlement_unique_idx").on(table.batchId, table.entitlementId),
]);

export const rewardDisputes = pgTable("reward_disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  entitlementId: uuid("entitlement_id").notNull().references(() => rewardEntitlements.id),
  backerUserId: uuid("backer_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidenceHash: varchar("evidence_hash", { length: 66 }),
  status: varchar("status", { length: 32 }).notNull().default("OPEN"),
  resolutionNote: text("resolution_note"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("reward_dispute_entitlement_idx").on(table.entitlementId),
  check("reward_dispute_status_check", sql`${table.status} IN ('OPEN', 'RESOLVED_CREATOR', 'RESOLVED_BACKER', 'DISMISSED')`),
]);

export const rewardCampaignProjection = pgTable("reward_campaign_projection", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  campaignMetadataId: uuid("campaign_metadata_id").references(() => rewardCampaigns.id),
  snapshot: jsonb("snapshot").notNull(),
}, table => [
  primaryKey({ columns: [table.streamId, table.onchainCampaignId] }),
]);
