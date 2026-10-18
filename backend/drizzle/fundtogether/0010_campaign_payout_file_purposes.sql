ALTER TABLE campaigns_payout_request_files
  ADD COLUMN purpose text;

UPDATE campaigns_payout_request_files AS files
SET purpose = CASE
  WHEN requests.revision > 1 THEN 'PREVIOUS_USE_EVIDENCE'
  ELSE 'USE_EXPLANATION'
END
FROM campaigns_payout_requests AS requests
WHERE requests.id = files.request_id;

ALTER TABLE campaigns_payout_request_files
  ALTER COLUMN purpose SET NOT NULL,
  ADD CONSTRAINT campaigns_payout_request_file_purpose_check
    CHECK (purpose IN ('USE_EXPLANATION', 'PREVIOUS_USE_EVIDENCE'));
