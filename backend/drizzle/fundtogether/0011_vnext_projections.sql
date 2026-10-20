CREATE TABLE IF NOT EXISTS "vnext_chain_events" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "transaction_hash" varchar(66) NOT NULL,
  "log_index" integer NOT NULL,
  "block_hash" varchar(66) NOT NULL,
  "block_number" numeric(78, 0) NOT NULL,
  "event_name" varchar(100) NOT NULL,
  "args" jsonb NOT NULL,
  "canonical" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "transaction_hash", "log_index")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vnext_chain_event_block_identity_idx"
  ON "vnext_chain_events" ("stream_id", "block_hash", "log_index");

CREATE TABLE IF NOT EXISTS "vnext_campaign_projections" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "creator" varchar(42) NOT NULL,
  "payout_wallet" varchar(42) NOT NULL,
  "terms_hash" varchar(66) NOT NULL,
  "publication_evidence_hash" varchar(66),
  "publication_review_case_id" varchar(66),
  "publication_outcome" integer,
  "policy_version" numeric(78, 0) NOT NULL,
  "goal" numeric(78, 0) NOT NULL,
  "funding_deadline" numeric(78, 0) NOT NULL,
  "raised" numeric(78, 0) NOT NULL DEFAULT 0,
  "paid_out" numeric(78, 0) NOT NULL DEFAULT 0,
  "refunded" numeric(78, 0) NOT NULL DEFAULT 0,
  "state" integer NOT NULL,
  "last_block_number" numeric(78, 0) NOT NULL,
  "last_event_name" varchar(100) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "onchain_campaign_id"),
  UNIQUE ("stream_id", "terms_hash")
);

CREATE TABLE IF NOT EXISTS "vnext_milestone_projections" (
  "stream_id" text NOT NULL,
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "milestone_id" integer NOT NULL,
  "budget" numeric(78, 0),
  "acceptance_criteria_hash" varchar(66),
  "evidence_revision" numeric(78, 0) NOT NULL DEFAULT 0,
  "evidence_hash" varchar(66),
  "review_case_id" varchar(66),
  "final_outcome" integer,
  "challenge_deadline" numeric(78, 0),
  "state" integer NOT NULL,
  "paid" boolean NOT NULL DEFAULT false,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "onchain_campaign_id", "milestone_id"),
  UNIQUE ("stream_id", "review_case_id")
);

CREATE TABLE IF NOT EXISTS "vnext_review_projections" (
  "stream_id" text NOT NULL,
  "review_case_id" varchar(66) NOT NULL,
  "root_case_id" varchar(66) NOT NULL,
  "campaign_id" numeric(78, 0) NOT NULL,
  "milestone_id" numeric(78, 0) NOT NULL,
  "evidence_revision" numeric(78, 0) NOT NULL,
  "round_id" numeric(78, 0) NOT NULL,
  "creator" varchar(42) NOT NULL,
  "enrolled_count" numeric(78, 0) NOT NULL DEFAULT 0,
  "outcome" integer,
  "finalized" boolean NOT NULL DEFAULT false,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "review_case_id")
);

CREATE TABLE IF NOT EXISTS "vnext_judge_assignments" (
  "stream_id" text NOT NULL,
  "review_case_id" varchar(66) NOT NULL,
  "round_id" numeric(78, 0) NOT NULL,
  "court_id" numeric(78, 0) NOT NULL,
  "slot" integer NOT NULL,
  "judge_address" varchar(42) NOT NULL,
  "last_block_number" numeric(78, 0) NOT NULL,
  PRIMARY KEY ("stream_id", "review_case_id", "court_id", "slot"),
  UNIQUE ("stream_id", "review_case_id", "judge_address")
);
