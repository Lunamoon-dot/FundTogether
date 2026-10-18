DO $$
BEGIN
  IF EXISTS (
    SELECT entitlement_id
    FROM historical_disputes
    WHERE status = 'OPEN'
    GROUP BY entitlement_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add historical dispute uniqueness: duplicate OPEN disputes exist';
  END IF;
END $$;

CREATE UNIQUE INDEX historical_dispute_one_open_idx
  ON historical_disputes (entitlement_id)
  WHERE status = 'OPEN';

CREATE INDEX historical_dispute_status_idx
  ON historical_disputes (status);

CREATE INDEX historical_entitlement_status_idx
  ON historical_entitlements (status);
