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

CREATE TABLE "campaigns_creator_profiles" (
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
  CONSTRAINT "campaigns_creator_profile_status_check" CHECK ("status" IN ('PENDING', 'VERIFIED', 'REJECTED'))
);
CREATE UNIQUE INDEX "campaigns_creator_profile_user_idx" ON "campaigns_creator_profiles" ("user_id");

CREATE TABLE "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_user_id" uuid NOT NULL REFERENCES "users"("id"),
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
  CONSTRAINT "campaign_goal_check" CHECK ("goal" > 0),
  CONSTRAINT "campaign_status_check" CHECK ("status" IN ('DRAFT', 'FROZEN', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE', 'COMPLETED', 'STOPPED'))
);
CREATE INDEX "campaign_creator_idx" ON "campaigns" ("creator_user_id");
CREATE INDEX "campaign_status_idx" ON "campaigns" ("status");

CREATE TABLE "campaigns_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id"),
  "resolver_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "outcome" varchar(32) NOT NULL,
  "decision_reason" text NOT NULL,
  "commitment_hash" varchar(66) NOT NULL,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_review_outcome_check" CHECK ("outcome" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED'))
);
CREATE INDEX "campaign_review_campaign_idx" ON "campaigns_reviews" ("campaign_id");

CREATE TABLE "campaigns_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id"),
  "tier_index" integer NOT NULL,
  "title" varchar(150) NOT NULL,
  "description" text NOT NULL,
  "price" numeric(78, 0) NOT NULL,
  "max_quantity" integer NOT NULL,
  "pledged_quantity" integer DEFAULT 0 NOT NULL,
  "is_digital" boolean DEFAULT false NOT NULL,
  "benefit_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "estimated_delivery_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campaign_tier_price_check" CHECK ("price" > 0),
  CONSTRAINT "campaign_tier_qty_check" CHECK ("max_quantity" > 0 AND "pledged_quantity" >= 0 AND "pledged_quantity" <= "max_quantity")
);
CREATE UNIQUE INDEX "campaign_tier_campaign_index_idx" ON "campaigns_tiers" ("campaign_id", "tier_index");

CREATE TABLE "historical_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id"),
  "tier_id" uuid NOT NULL REFERENCES "campaigns_tiers"("id"),
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
  CONSTRAINT "historical_entitlement_status_check" CHECK ("status" IN ('PENDING_FUNDING', 'ACTIVE', 'REDEEM_REQUESTED', 'FULFILLING', 'DELIVERED', 'CONFIRMED', 'DISPUTED', 'REFUND_ELIGIBLE', 'REFUNDED'))
);
CREATE INDEX "historical_entitlement_campaign_idx" ON "historical_entitlements" ("campaign_id");
CREATE INDEX "historical_entitlement_backer_idx" ON "historical_entitlements" ("backer_user_id");
CREATE INDEX "historical_entitlement_tx_hash_idx" ON "historical_entitlements" ("tx_hash");
CREATE UNIQUE INDEX "historical_entitlements_tx_log_idx" ON "historical_entitlements" ("tx_hash", "log_index");

CREATE TABLE "campaign_fulfillment_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id"),
  "batch_number" integer NOT NULL,
  "title" varchar(150) NOT NULL,
  "carrier" varchar(100) NOT NULL,
  "manifest_hash" varchar(66) NOT NULL,
  "shipped_item_count" integer NOT NULL,
  "shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "campaign_batch_campaign_idx" ON "campaign_fulfillment_batches" ("campaign_id", "batch_number");

CREATE TABLE "campaign_batch_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL REFERENCES "campaign_fulfillment_batches"("id"),
  "entitlement_id" uuid NOT NULL REFERENCES "historical_entitlements"("id"),
  "carrier_tracking_code" varchar(100) NOT NULL,
  "shipped_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "campaign_batch_entitlement_unique_idx" ON "campaign_batch_entitlements" ("batch_id", "entitlement_id");

CREATE TABLE "historical_disputes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entitlement_id" uuid NOT NULL REFERENCES "historical_entitlements"("id"),
  "backer_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "evidence_hash" varchar(66),
  "status" varchar(32) DEFAULT 'OPEN' NOT NULL,
  "resolution_note" text,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "historical_dispute_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED_CREATOR', 'RESOLVED_BACKER', 'DISMISSED'))
);
CREATE INDEX "historical_dispute_entitlement_idx" ON "historical_disputes" ("entitlement_id");

CREATE TABLE "historical_campaign_projection" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "campaign_metadata_id" uuid REFERENCES "campaigns"("id"),
  "snapshot" jsonb NOT NULL,
  PRIMARY KEY("stream_id", "onchain_campaign_id")
);

-- Final Campaign schema for the clean local test baseline.
ALTER TABLE campaigns ADD COLUMN draft_config jsonb;
ALTER TABLE campaigns ALTER COLUMN policy_hash DROP NOT NULL;
ALTER TABLE campaigns ADD CONSTRAINT campaign_policy_check
  CHECK (policy_hash IS NOT NULL OR (draft_config IS NOT NULL AND category = 'COMICS_ARTBOOK'));

ALTER TABLE campaigns ADD COLUMN review_preparation jsonb;
ALTER TABLE campaigns ADD COLUMN frozen_snapshot jsonb;
ALTER TABLE campaigns ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE campaigns ADD COLUMN payout_wallet_link_id uuid REFERENCES wallet_links(id);
ALTER TABLE campaigns_reviews ADD COLUMN frozen_snapshot jsonb;

CREATE TABLE campaigns_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  object_id uuid NOT NULL UNIQUE,
  sha256 varchar(66) NOT NULL,
  media_type varchar(50) NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  purpose varchar(32) NOT NULL DEFAULT 'SAMPLE_PAGE' CHECK (purpose = 'SAMPLE_PAGE'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_sample_campaign_idx ON campaigns_samples(campaign_id);

CREATE TABLE campaigns_chain_campaigns (
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  onchain_campaign_id numeric(78,0) NOT NULL,
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  snapshot jsonb NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (stream_id, onchain_campaign_id)
);
CREATE INDEX campaigns_chain_campaign_metadata_idx ON campaigns_chain_campaigns(campaign_id);

CREATE TABLE campaigns_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  chain_id varchar(32) NOT NULL,
  contract_address varchar(42) NOT NULL,
  transaction_hash varchar(66) NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash varchar(66) NOT NULL,
  block_number numeric(78,0) NOT NULL,
  backer_wallet varchar(42) NOT NULL,
  backer_user_id uuid REFERENCES users(id),
  amount_paid numeric(78,0) NOT NULL CHECK (amount_paid > 0),
  canonical boolean NOT NULL DEFAULT true,
  refunded boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contract_address, transaction_hash, log_index)
);
CREATE INDEX campaigns_entitlement_owner_idx ON campaigns_entitlements(backer_user_id);
CREATE INDEX campaigns_entitlement_campaign_idx ON campaigns_entitlements(campaign_id);

ALTER TABLE campaigns_entitlements ADD COLUMN confirmed_evidence_hash varchar(66);

CREATE TABLE campaigns_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('PRODUCTION_EVIDENCE', 'FINAL_PDF')),
  object_id uuid NOT NULL UNIQUE,
  sha256 varchar(66) NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  summary text NOT NULL,
  production_hash varchar(66) NOT NULL,
  evidence_hash varchar(66) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, stream_id, evidence_hash)
);
CREATE TABLE campaigns_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  target_hash varchar(66) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COMMENT', 'ISSUE', 'FILE_UNAVAILABLE')),
  body text NOT NULL,
  body_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, author_user_id, target_hash, kind, body_hash)
);
CREATE TABLE campaigns_download_tickets (
  token_hash varchar(64) PRIMARY KEY,
  entitlement_id uuid NOT NULL REFERENCES campaigns_entitlements(id),
  evidence_id uuid NOT NULL REFERENCES campaigns_evidence(id),
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  requested_at timestamptz
);

ALTER TABLE campaigns ADD COLUMN review_started_at timestamptz;

ALTER TABLE campaigns DROP CONSTRAINT campaign_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaign_status_check CHECK (status IN (
  'DRAFT', 'FROZEN', 'UNDER_REVIEW', 'UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW',
  'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE',
  'COMPLETED', 'STOPPED'
));

-- Retain the immutable archive shape while starting this local baseline empty.
CREATE TABLE IF NOT EXISTS campaign_physical_retirement_approvals (
  entitlement_id uuid PRIMARY KEY,
  row_hash text NOT NULL,
  evidence jsonb NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE SCHEMA campaign_archive;
REVOKE ALL ON SCHEMA campaign_archive FROM PUBLIC;
CREATE TABLE campaign_archive.entitlement_delivery (
  entitlement_id uuid PRIMARY KEY,
  campaign_id uuid,
  original_entitlement jsonb,
  archived_at timestamptz
);
ALTER TABLE campaign_fulfillment_batches SET SCHEMA campaign_archive;
ALTER TABLE campaign_batch_entitlements SET SCHEMA campaign_archive;
ALTER TABLE campaign_physical_retirement_approvals SET SCHEMA campaign_archive;
CREATE TABLE campaign_archive.campaign_history (
  campaign_id uuid PRIMARY KEY,
  campaign jsonb,
  tiers jsonb,
  entitlements jsonb,
  disputes jsonb,
  projections jsonb
);
CREATE FUNCTION campaign_archive.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Retained history is immutable; use an explicit reviewed recovery migration'; END $$;
CREATE TRIGGER immutable_delivery BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON campaign_archive.entitlement_delivery FOR EACH STATEMENT EXECUTE FUNCTION campaign_archive.reject_mutation();
CREATE TRIGGER immutable_batches BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON campaign_archive.campaign_fulfillment_batches FOR EACH STATEMENT EXECUTE FUNCTION campaign_archive.reject_mutation();
CREATE TRIGGER immutable_batch_items BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON campaign_archive.campaign_batch_entitlements FOR EACH STATEMENT EXECUTE FUNCTION campaign_archive.reject_mutation();
CREATE TRIGGER immutable_approval BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON campaign_archive.campaign_physical_retirement_approvals FOR EACH STATEMENT EXECUTE FUNCTION campaign_archive.reject_mutation();
CREATE TRIGGER immutable_campaign_history BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON campaign_archive.campaign_history FOR EACH STATEMENT EXECUTE FUNCTION campaign_archive.reject_mutation();
ALTER TABLE historical_entitlements
  DROP COLUMN shipping_encrypted, DROP COLUMN shipping_iv, DROP COLUMN shipping_tag, DROP COLUMN shipping_updated_at,
  DROP COLUMN shipping_full_name, DROP COLUMN shipping_address, DROP COLUMN shipping_phone,
  DROP COLUMN carrier_tracking_code, DROP COLUMN delivered_at, DROP COLUMN confirmed_at;

ALTER TABLE campaigns_creator_profiles
  ADD COLUMN primary_genre varchar(100),
  ADD COLUMN portfolio_url varchar(500),
  ADD COLUMN social_url varchar(500),
  ADD COLUMN contact_email varchar(255),
  ADD COLUMN original_work_pledge boolean;

CREATE TABLE campaigns_creator_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  submission_revision integer NOT NULL CHECK (submission_revision >= 0),
  commitment_hash varchar(66) NOT NULL,
  response_body text NOT NULL CHECK (char_length(btrim(response_body)) BETWEEN 10 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_creator_response_campaign_idx ON campaigns_creator_responses(campaign_id, created_at);
CREATE UNIQUE INDEX campaigns_creator_response_revision_idx ON campaigns_creator_responses(campaign_id, submission_revision);

CREATE TABLE campaigns_creator_response_feedback (
  response_id uuid NOT NULL REFERENCES campaigns_creator_responses(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES campaigns_feedback(id) ON DELETE CASCADE,
  PRIMARY KEY (response_id, feedback_id)
);
CREATE INDEX campaigns_creator_response_feedback_feedback_idx ON campaigns_creator_response_feedback(feedback_id);

CREATE TABLE campaigns_review_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  entitlement_id uuid NOT NULL REFERENCES campaigns_entitlements(id),
  backer_user_id uuid NOT NULL REFERENCES users(id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  target_hash varchar(66) NOT NULL,
  commitment_hash varchar(66) NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campaigns_review_thread_identity_idx ON campaigns_review_threads(campaign_id, entitlement_id, target_hash);
CREATE INDEX campaigns_review_thread_campaign_idx ON campaigns_review_threads(campaign_id);
CREATE INDEX campaigns_review_thread_backer_idx ON campaigns_review_threads(backer_user_id);
CREATE INDEX campaigns_review_thread_status_idx ON campaigns_review_threads(status);

CREATE TABLE campaigns_review_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES campaigns_review_threads(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  author_role text NOT NULL CHECK (author_role IN ('BACKER', 'CREATOR', 'RESOLVER')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_review_message_thread_idx ON campaigns_review_messages(thread_id, created_at);

CREATE TABLE campaigns_review_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES campaigns_review_threads(id),
  opener_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 3000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')),
  resolver_user_id uuid REFERENCES users(id),
  outcome text CHECK (outcome IS NULL OR outcome IN ('RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')),
  note text CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 10 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX campaigns_review_escalation_thread_idx ON campaigns_review_escalations(thread_id);
CREATE INDEX campaigns_review_escalation_status_idx ON campaigns_review_escalations(status);
