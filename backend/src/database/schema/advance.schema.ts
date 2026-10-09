import { sql } from "drizzle-orm";
import { check, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { campaignMetadata } from "./campaigns.schema";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";
import { indexerStreams } from "./indexer.schema";
import type { GiftDraft } from "../../advance/advance-campaign.schema";
import type { AdvanceCampaignSnapshot } from "../../advance/advance.types";

export const advanceCampaignPlans = pgTable("advance_campaign_plans", {
  campaignMetadataId: uuid("campaign_metadata_id").primaryKey().references(() => campaignMetadata.id),
  deploymentId: varchar("deployment_id", { length: 66 }).notNull(),
  chainId: integer("chain_id").notNull(), contractAddress: varchar("contract_address", { length: 42 }).notNull(),
  giftConfig: jsonb("gift_config").$type<GiftDraft>().notNull(),
  fundingDuration: numeric("funding_duration", { precision: 78, scale: 0 }).notNull(),
  organizerWallet: varchar("organizer_wallet", { length: 42 }), draftKey: varchar("draft_key", { length: 66 }),
  frozenPlanBytes: text("frozen_plan_bytes"), planHash: varchar("plan_hash", { length: 66 }),
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
}, t => [
  uniqueIndex("advance_plan_draft_key_idx").on(t.deploymentId, t.organizerWallet, t.draftKey),
  check("advance_plan_context_check", sql`${t.chainId} = 31338 AND ${t.deploymentId} ~ '^0x[0-9a-f]{64}$' AND ${t.deploymentId} !~ '^0x0+$' AND ${t.contractAddress} ~ '^0x[0-9a-f]{40}$' AND ${t.contractAddress} !~ '^0x0+$'`),
  check("advance_plan_duration_check", sql`${t.fundingDuration} >= 86400 AND ${t.fundingDuration} <= 2592000`),
  check("advance_plan_gift_check", sql`(${t.giftConfig}->>'activityType' = 'GIFT_DISTRIBUTION' AND ${t.giftConfig}->>'channel' IN ('DIRECT', 'INSTITUTION') AND ${t.giftConfig}->>'checklistVersion' = 'gift.v1' AND jsonb_typeof(${t.giftConfig}->'stages') = 'array' AND jsonb_array_length(${t.giftConfig}->'stages') > 0) IS TRUE`),
  check("advance_plan_freeze_check", sql`(${t.frozenAt} IS NULL AND ${t.planHash} IS NULL AND ${t.frozenPlanBytes} IS NULL AND ${t.draftKey} IS NULL AND ${t.organizerWallet} IS NULL) OR (${t.frozenAt} IS NOT NULL AND ${t.planHash} IS NOT NULL AND ${t.planHash} ~ '^0x[0-9a-f]{64}$' AND ${t.planHash} !~ '^0x0+$' AND ${t.frozenPlanBytes} IS NOT NULL AND ${t.draftKey} IS NOT NULL AND ${t.draftKey} ~ '^0x[0-9a-f]{64}$' AND ${t.draftKey} !~ '^0x0+$' AND ${t.organizerWallet} IS NOT NULL AND ${t.organizerWallet} ~ '^0x[0-9a-f]{40}$' AND ${t.organizerWallet} !~ '^0x0+$')`),
]);

export const organizationVerificationRecords = pgTable("organization_verification_records", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  status: varchar("status", { length: 16 }).notNull(), reportBytes: text("report_bytes").notNull(),
  hash: varchar("hash", { length: 66 }).notNull().unique(), checkedBy: uuid("checked_by").notNull().references(() => users.id),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [check("organization_verification_status_check", sql`${t.status} IN ('VERIFIED', 'REVOKED')`),
  check("organization_verification_hash_check", sql`${t.hash} ~ '^0x[0-9a-f]{64}$' AND ${t.hash} !~ '^0x0+$'`)]);

export const advanceCampaignProjection = pgTable("advance_campaign_projection", {
  streamId: text("stream_id").notNull().references(() => indexerStreams.streamId),
  onchainCampaignId: numeric("onchain_campaign_id", { precision: 78, scale: 0 }).notNull(),
  metadataId: uuid("metadata_id").references(() => campaignMetadata.id),
  snapshot: jsonb("snapshot").$type<AdvanceCampaignSnapshot>().notNull(),
}, t => [primaryKey({ columns: [t.streamId, t.onchainCampaignId] }),
  check("advance_projection_id_check", sql`${t.onchainCampaignId} >= 0 AND ${t.onchainCampaignId} <= 115792089237316195423570985008687907853269984665640564039457584007913129639935`)]);
