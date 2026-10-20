ALTER TABLE "vnext_milestone_projections"
  ADD COLUMN IF NOT EXISTS "correction_deadline" numeric(78, 0);

CREATE TABLE IF NOT EXISTS "vnext_case_evidence" (
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "review_case_id" varchar(66) NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "object_id" uuid NOT NULL UNIQUE,
  "sha256" varchar(66) NOT NULL,
  "media_type" varchar(80) NOT NULL,
  "size_bytes" integer NOT NULL,
  "summary" text NOT NULL,
  "evidence_hash" varchar(66) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "review_case_id", "evidence_hash"),
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  CHECK ("media_type" IN ('application/pdf', 'image/png', 'image/jpeg'))
);
CREATE INDEX IF NOT EXISTS "vnext_case_evidence_case_idx"
  ON "vnext_case_evidence" ("stream_id", "review_case_id");
