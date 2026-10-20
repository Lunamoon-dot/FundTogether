ALTER TABLE "vnext_review_projections"
  ADD COLUMN IF NOT EXISTS "court_count" numeric(78, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "finalized_court_count" numeric(78, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pass_courts" numeric(78, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fail_courts" numeric(78, 0) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "vnext_backer_projections" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "backer_address" varchar(42) NOT NULL,
  "contributed" numeric(78, 0) NOT NULL DEFAULT 0,
  "refunded" numeric(78, 0) NOT NULL DEFAULT 0,
  "refund_claimed" boolean NOT NULL DEFAULT false,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "onchain_campaign_id", "backer_address")
);
CREATE INDEX IF NOT EXISTS "vnext_backer_campaign_idx"
  ON "vnext_backer_projections" ("stream_id", "onchain_campaign_id");

CREATE TABLE IF NOT EXISTS "vnext_challenge_projections" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "onchain_campaign_id" numeric(78, 0) NOT NULL,
  "milestone_id" integer NOT NULL,
  "challenge_case_id" varchar(66) NOT NULL,
  "challenger" varchar(42) NOT NULL,
  "evidence_hash" varchar(66) NOT NULL,
  "outcome" integer,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "challenge_case_id")
);
CREATE INDEX IF NOT EXISTS "vnext_challenge_campaign_milestone_idx"
  ON "vnext_challenge_projections" ("stream_id", "onchain_campaign_id", "milestone_id");

CREATE TABLE IF NOT EXISTS "vnext_judge_ledger_projections" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "review_case_id" varchar(66) NOT NULL,
  "judge_address" varchar(42) NOT NULL,
  "reserved" numeric(78, 0) NOT NULL DEFAULT 0,
  "released" numeric(78, 0) NOT NULL DEFAULT 0,
  "settled" numeric(78, 0) NOT NULL DEFAULT 0,
  "case_slashed" numeric(78, 0) NOT NULL DEFAULT 0,
  "reward_accrued" numeric(78, 0) NOT NULL DEFAULT 0,
  "reward_claimed" numeric(78, 0) NOT NULL DEFAULT 0,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "review_case_id", "judge_address")
);
CREATE INDEX IF NOT EXISTS "vnext_judge_ledger_judge_idx"
  ON "vnext_judge_ledger_projections" ("stream_id", "judge_address");
