ALTER TABLE reward_campaigns ADD COLUMN draft_config jsonb;
ALTER TABLE reward_campaigns ALTER COLUMN policy_hash DROP NOT NULL;
ALTER TABLE reward_campaigns ADD CONSTRAINT reward_campaign_policy_check
  CHECK (policy_hash IS NOT NULL OR (draft_config IS NOT NULL AND category = 'COMICS_ARTBOOK'));
