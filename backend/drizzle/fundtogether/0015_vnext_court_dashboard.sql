ALTER TABLE "vnext_review_projections"
  ADD COLUMN IF NOT EXISTS "invalid_courts" numeric(78, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "round_outcome" integer,
  ADD COLUMN IF NOT EXISTS "final_outcome" integer;

ALTER TABLE "vnext_judge_assignments"
  ADD COLUMN IF NOT EXISTS "committed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "revealed" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "vnext_court_projections" (
  "stream_id" text NOT NULL,
  "review_case_id" varchar(66) NOT NULL,
  "round_id" numeric(78, 0) NOT NULL,
  "court_id" numeric(78, 0) NOT NULL,
  "outcome" integer,
  "finalized" boolean NOT NULL DEFAULT false,
  "last_block_number" numeric(78, 0) NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("stream_id", "review_case_id", "court_id")
);

UPDATE "vnext_review_projections"
SET "court_count" = LEAST("court_count", 5);

INSERT INTO "vnext_court_projections" (
  "stream_id",
  "review_case_id",
  "round_id",
  "court_id",
  "last_block_number"
)
SELECT
  assignment."stream_id",
  assignment."review_case_id",
  assignment."round_id",
  assignment."court_id",
  MAX(assignment."last_block_number")
FROM "vnext_judge_assignments" assignment
JOIN "vnext_review_projections" review
  ON review."stream_id" = assignment."stream_id"
  AND review."review_case_id" = assignment."review_case_id"
WHERE assignment."court_id" < review."court_count"
GROUP BY
  assignment."stream_id",
  assignment."review_case_id",
  assignment."round_id",
  assignment."court_id"
ON CONFLICT ("stream_id", "review_case_id", "court_id") DO NOTHING;

UPDATE "vnext_judge_assignments" assignment
SET
  "committed" = true,
  "last_block_number" = GREATEST(assignment."last_block_number", event."block_number")
FROM "vnext_chain_events" event
WHERE event."canonical" = true
  AND event."event_name" IN ('VoteCommitted', 'VoteRevealed')
  AND event."stream_id" = assignment."stream_id"
  AND lower(event."args"->>'reviewCaseId') = assignment."review_case_id"
  AND event."args"->>'courtId' = assignment."court_id"::text
  AND lower(event."args"->>'judge') = assignment."judge_address";

UPDATE "vnext_judge_assignments" assignment
SET
  "revealed" = true,
  "last_block_number" = GREATEST(assignment."last_block_number", event."block_number")
FROM "vnext_chain_events" event
WHERE event."canonical" = true
  AND event."event_name" = 'VoteRevealed'
  AND event."stream_id" = assignment."stream_id"
  AND lower(event."args"->>'reviewCaseId') = assignment."review_case_id"
  AND event."args"->>'courtId' = assignment."court_id"::text
  AND lower(event."args"->>'judge') = assignment."judge_address";

UPDATE "vnext_court_projections" court
SET
  "outcome" = (event."args"->>'outcome')::integer,
  "finalized" = true,
  "last_block_number" = GREATEST(court."last_block_number", event."block_number"),
  "updated_at" = now()
FROM "vnext_chain_events" event
WHERE event."canonical" = true
  AND event."event_name" = 'CourtFinalized'
  AND event."stream_id" = court."stream_id"
  AND lower(event."args"->>'reviewCaseId') = court."review_case_id"
  AND event."args"->>'courtId' = court."court_id"::text;

UPDATE "vnext_review_projections" review
SET "round_outcome" = (event."args"->>'outcome')::integer
FROM "vnext_chain_events" event
WHERE event."canonical" = true
  AND event."event_name" = 'ReviewRoundFinalized'
  AND event."stream_id" = review."stream_id"
  AND lower(event."args"->>'reviewCaseId') = review."review_case_id";

UPDATE "vnext_review_projections" review
SET "final_outcome" = (event."args"->>'outcome')::integer
FROM "vnext_chain_events" event
WHERE event."canonical" = true
  AND event."event_name" = 'FinalRulingEstablished'
  AND event."stream_id" = review."stream_id"
  AND (
    review."review_case_id" = lower(event."args"->>'reviewCaseId')
    OR review."root_case_id" = lower(event."args"->>'reviewCaseId')
  );

UPDATE "vnext_review_projections"
SET "invalid_courts" = GREATEST("court_count" - "pass_courts" - "fail_courts", 0)
WHERE "round_outcome" IS NOT NULL;
