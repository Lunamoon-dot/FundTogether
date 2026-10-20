CREATE TABLE IF NOT EXISTS "vnext_evidence_access_tickets" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "stream_id" text NOT NULL REFERENCES "indexer_streams"("stream_id"),
  "review_case_id" varchar(66) NOT NULL,
  "evidence_hash" varchar(66) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp with time zone NOT NULL,
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "requested_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "vnext_evidence_access_ticket_user_idx"
  ON "vnext_evidence_access_tickets" ("user_id", "expires_at");
