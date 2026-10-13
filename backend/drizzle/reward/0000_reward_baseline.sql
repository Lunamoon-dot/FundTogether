CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(254),
  "password_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "wallet_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "chain_id" varchar(32) NOT NULL,
  "address" varchar(42) NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "wallet_links_chain_address_idx" ON "wallet_links" ("chain_id", "address");

CREATE TABLE "auth_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");

CREATE TABLE "auth_challenges" (
  "nonce" varchar(32) PRIMARY KEY NOT NULL,
  "session_hash" varchar(64) REFERENCES "auth_sessions"("token_hash") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "representative_wallet_link_id" uuid REFERENCES "wallet_links"("id"),
  "verification_status" varchar(32) DEFAULT 'unverified' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "organization_members" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" varchar(32) DEFAULT 'OWNER' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY("organization_id", "user_id"),
  CONSTRAINT "organization_members_role_check" CHECK ("role" = 'OWNER')
);
CREATE INDEX "organization_members_user_idx" ON "organization_members" ("user_id");

CREATE TABLE "platform_roles" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "roles" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "indexer_streams" (
  "stream_id" text PRIMARY KEY NOT NULL,
  "last_block" numeric(78, 0),
  "last_block_hash" varchar(66),
  "head_block" numeric(78, 0),
  "status" varchar(20) DEFAULT 'syncing' NOT NULL,
  "error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "chain_events" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "transaction_hash" varchar(66) NOT NULL,
  "log_index" integer NOT NULL,
  "block_hash" varchar(66) NOT NULL,
  "block_number" numeric(78, 0) NOT NULL,
  "event_name" varchar(100) NOT NULL,
  "args" jsonb NOT NULL,
  "canonical" boolean DEFAULT true NOT NULL,
  PRIMARY KEY("stream_id", "transaction_hash", "log_index", "block_hash")
);

CREATE TABLE "reward_creator_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "display_name" varchar(150) NOT NULL,
  "bio" text NOT NULL,
  "ip_declaration" text NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_creator_profile_status_check" CHECK ("status" IN ('PENDING', 'VERIFIED', 'REJECTED'))
);
CREATE UNIQUE INDEX "reward_creator_profile_user_idx" ON "reward_creator_profiles" ("user_id");

CREATE TABLE "reward_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "title" varchar(200) NOT NULL,
  "pitch" varchar(500) NOT NULL,
  "story" text NOT NULL,
  "category" varchar(50) DEFAULT 'COMICS' NOT NULL,
  "commitment_hash" varchar(66),
  "goal" numeric(78, 0) NOT NULL,
  "funding_duration" integer DEFAULT 2592000 NOT NULL,
  "policy_hash" varchar(66) NOT NULL,
  "onchain_campaign_id" numeric(78, 0),
  "status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
  "frozen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_campaign_goal_check" CHECK ("goal" > 0),
  CONSTRAINT "reward_campaign_status_check" CHECK ("status" IN ('DRAFT', 'FROZEN', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE', 'COMPLETED', 'STOPPED'))
);
CREATE INDEX "reward_campaign_creator_idx" ON "reward_campaigns" ("creator_user_id");
CREATE INDEX "reward_campaign_status_idx" ON "reward_campaigns" ("status");

CREATE TABLE "reward_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "reward_campaigns"("id"),
  "resolver_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "outcome" varchar(32) NOT NULL,
  "decision_reason" text NOT NULL,
  "commitment_hash" varchar(66) NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_review_outcome_check" CHECK ("outcome" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED'))
);
CREATE INDEX "reward_review_campaign_idx" ON "reward_reviews" ("campaign_id");

CREATE TABLE "reward_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "reward_campaigns"("id"),
  "tier_index" integer NOT NULL,
  "title" varchar(150) NOT NULL,
  "description" text NOT NULL,
  "price" numeric(78, 0) NOT NULL,
  "max_quantity" integer NOT NULL,
  "pledged_quantity" integer DEFAULT 0 NOT NULL,
  "is_digital" boolean DEFAULT false NOT NULL,
  "reward_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "estimated_delivery_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_tier_price_check" CHECK ("price" > 0),
  CONSTRAINT "reward_tier_qty_check" CHECK ("max_quantity" > 0 AND "pledged_quantity" >= 0 AND "pledged_quantity" <= "max_quantity")
);
CREATE UNIQUE INDEX "reward_tier_campaign_index_idx" ON "reward_tiers" ("campaign_id", "tier_index");

CREATE TABLE "reward_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "reward_campaigns"("id"),
  "tier_id" uuid NOT NULL REFERENCES "reward_tiers"("id"),
  "onchain_tier_index" integer,
  "backer_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "backer_wallet" varchar(42) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "amount_paid" numeric(78, 0) NOT NULL,
  "tx_hash" varchar(66),
  "log_index" integer,
  "status" varchar(32) DEFAULT 'PENDING_FUNDING' NOT NULL,
  "digital_access_code" varchar(100),
  "shipping_encrypted" text,
  "shipping_iv" varchar(64),
  "shipping_tag" varchar(64),
  "shipping_updated_at" timestamp with time zone,
  "shipping_full_name" varchar(150),
  "shipping_address" text,
  "shipping_phone" varchar(50),
  "carrier_tracking_code" varchar(100),
  "delivered_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_entitlement_status_check" CHECK ("status" IN ('PENDING_FUNDING', 'ACTIVE', 'REDEEM_REQUESTED', 'FULFILLING', 'DELIVERED', 'CONFIRMED', 'DISPUTED', 'REFUND_ELIGIBLE', 'REFUNDED'))
);
CREATE INDEX "reward_entitlement_campaign_idx" ON "reward_entitlements" ("campaign_id");
CREATE INDEX "reward_entitlement_backer_idx" ON "reward_entitlements" ("backer_user_id");
CREATE INDEX "reward_entitlement_tx_hash_idx" ON "reward_entitlements" ("tx_hash");
CREATE UNIQUE INDEX "reward_entitlements_tx_log_idx" ON "reward_entitlements" ("tx_hash", "log_index");

CREATE TABLE "reward_fulfillment_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "reward_campaigns"("id"),
  "batch_number" integer NOT NULL,
  "title" varchar(150) NOT NULL,
  "carrier" varchar(100) NOT NULL,
  "manifest_hash" varchar(66) NOT NULL,
  "shipped_item_count" integer NOT NULL,
  "shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "reward_batch_campaign_idx" ON "reward_fulfillment_batches" ("campaign_id", "batch_number");

CREATE TABLE "reward_batch_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL REFERENCES "reward_fulfillment_batches"("id"),
  "entitlement_id" uuid NOT NULL REFERENCES "reward_entitlements"("id"),
  "carrier_tracking_code" varchar(100) NOT NULL,
  "shipped_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "reward_batch_entitlement_unique_idx" ON "reward_batch_entitlements" ("batch_id", "entitlement_id");

CREATE TABLE "reward_disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entitlement_id" uuid NOT NULL REFERENCES "reward_entitlements"("id"),
  "backer_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "evidence_hash" varchar(66),
  "status" varchar(32) DEFAULT 'OPEN' NOT NULL,
  "resolution_note" text,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reward_dispute_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED_CREATOR', 'RESOLVED_BACKER', 'DISMISSED'))
);
CREATE INDEX "reward_dispute_entitlement_idx" ON "reward_disputes" ("entitlement_id");

CREATE TABLE "reward_campaign_projection" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "campaign_metadata_id" uuid REFERENCES "reward_campaigns"("id"),
  "snapshot" jsonb NOT NULL,
  PRIMARY KEY("stream_id", "onchain_campaign_id")
);
