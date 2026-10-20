ALTER TABLE "vnext_milestone_projections"
  ADD COLUMN IF NOT EXISTS "submission_deadline" numeric(78, 0),
  ADD COLUMN IF NOT EXISTS "correction_deadline" numeric(78, 0);
