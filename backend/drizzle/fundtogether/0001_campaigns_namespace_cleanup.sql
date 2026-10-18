-- The disposable local baseline already uses the canonical FundTogether
-- Campaign names. This migration is intentionally a no-op for old local
-- databases; production data migrations are outside this test runtime.
SELECT 1;
