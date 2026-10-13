-- Run only after the Editions digital acceptance suite and deployment-scoped obligation audit.
-- Keep exact historical data and financial rows; do not relabel or settle any entitlement.
CREATE TABLE IF NOT EXISTS reward_physical_retirement_approvals (
  entitlement_id uuid PRIMARY KEY,
  row_hash text NOT NULL,
  evidence jsonb NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);
LOCK TABLE reward_entitlements, reward_fulfillment_batches, reward_batch_entitlements IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM reward_entitlements e JOIN reward_tiers t ON t.id=e.tier_id
    LEFT JOIN reward_physical_retirement_approvals a ON a.entitlement_id=e.id
    WHERE (NOT t.is_digital OR num_nonnulls(e.shipping_encrypted,e.shipping_iv,e.shipping_tag,e.shipping_updated_at,e.shipping_full_name,e.shipping_address,e.shipping_phone,e.carrier_tracking_code,e.delivered_at,e.confirmed_at)>0)
      AND (a.row_hash IS DISTINCT FROM md5(row_to_json(e)::text) OR a.evidence->>'fixtureVerified' IS DISTINCT FROM 'true')
  ) THEN RAISE EXCEPTION 'Physical obligations require a fresh deployment-scoped reconciliation before retirement'; END IF;
  IF EXISTS (SELECT 1 FROM reward_fulfillment_batches b WHERE NOT EXISTS (
    SELECT 1 FROM reward_entitlements e JOIN reward_physical_retirement_approvals a ON a.entitlement_id=e.id WHERE e.campaign_id=b.campaign_id
  )) THEN RAISE EXCEPTION 'Unreconciled fulfillment batch'; END IF;
END $$;
CREATE SCHEMA reward_archive;
REVOKE ALL ON SCHEMA reward_archive FROM PUBLIC;
CREATE TABLE reward_archive.entitlement_delivery AS
SELECT e.id AS entitlement_id, e.campaign_id, row_to_json(e)::jsonb AS original_entitlement, now() AS archived_at
FROM reward_entitlements e JOIN reward_tiers t ON t.id=e.tier_id
WHERE NOT t.is_digital OR num_nonnulls(e.shipping_encrypted,e.shipping_iv,e.shipping_tag,e.shipping_updated_at,e.shipping_full_name,e.shipping_address,e.shipping_phone,e.carrier_tracking_code,e.delivered_at,e.confirmed_at)>0;
ALTER TABLE reward_archive.entitlement_delivery ADD PRIMARY KEY (entitlement_id);
ALTER TABLE reward_fulfillment_batches SET SCHEMA reward_archive;
ALTER TABLE reward_batch_entitlements SET SCHEMA reward_archive;
ALTER TABLE reward_physical_retirement_approvals SET SCHEMA reward_archive;
-- Snapshots survive a later canonical reorg; they describe history, not current claim eligibility.
CREATE TABLE reward_archive.campaign_history AS
SELECT c.id AS campaign_id, row_to_json(c)::jsonb AS campaign,
  (SELECT jsonb_agg(row_to_json(t)) FROM reward_tiers t WHERE t.campaign_id=c.id) AS tiers,
  (SELECT jsonb_agg(row_to_json(e)) FROM reward_entitlements e WHERE e.campaign_id=c.id) AS entitlements,
  (SELECT jsonb_agg(row_to_json(d)) FROM reward_disputes d JOIN reward_entitlements e ON e.id=d.entitlement_id WHERE e.campaign_id=c.id) AS disputes,
  (SELECT jsonb_agg(row_to_json(p)) FROM reward_campaign_projection p WHERE p.campaign_metadata_id=c.id) AS projections
FROM reward_campaigns c WHERE EXISTS (SELECT 1 FROM reward_archive.entitlement_delivery a WHERE a.campaign_id=c.id);
ALTER TABLE reward_archive.campaign_history ADD PRIMARY KEY (campaign_id);
-- Archived joins must not block canonical rollback of live projections.
DO $$ DECLARE fk record; BEGIN
  FOR fk IN SELECT conname, conrelid::regclass AS relation FROM pg_constraint
    WHERE contype='f' AND connamespace='reward_archive'::regnamespace AND confrelid IN ('reward_entitlements'::regclass, 'reward_campaigns'::regclass)
  LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.relation, fk.conname); END LOOP;
END $$;
CREATE FUNCTION reward_archive.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Retained history is immutable; use an explicit reviewed recovery migration'; END $$;
CREATE TRIGGER immutable_delivery BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON reward_archive.entitlement_delivery FOR EACH STATEMENT EXECUTE FUNCTION reward_archive.reject_mutation();
CREATE TRIGGER immutable_batches BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON reward_archive.reward_fulfillment_batches FOR EACH STATEMENT EXECUTE FUNCTION reward_archive.reject_mutation();
CREATE TRIGGER immutable_batch_items BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON reward_archive.reward_batch_entitlements FOR EACH STATEMENT EXECUTE FUNCTION reward_archive.reject_mutation();
CREATE TRIGGER immutable_approval BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON reward_archive.reward_physical_retirement_approvals FOR EACH STATEMENT EXECUTE FUNCTION reward_archive.reject_mutation();
CREATE TRIGGER immutable_campaign_history BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON reward_archive.campaign_history FOR EACH STATEMENT EXECUTE FUNCTION reward_archive.reject_mutation();
ALTER TABLE reward_entitlements
  DROP COLUMN shipping_encrypted, DROP COLUMN shipping_iv, DROP COLUMN shipping_tag, DROP COLUMN shipping_updated_at,
  DROP COLUMN shipping_full_name, DROP COLUMN shipping_address, DROP COLUMN shipping_phone,
  DROP COLUMN carrier_tracking_code, DROP COLUMN delivered_at, DROP COLUMN confirmed_at;
