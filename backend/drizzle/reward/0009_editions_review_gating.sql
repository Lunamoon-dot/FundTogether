ALTER TABLE reward_campaigns DROP CONSTRAINT reward_campaign_status_check;

UPDATE reward_campaigns
SET status = 'COMMUNITY_REVIEW', updated_at = now()
WHERE category = 'COMICS_ARTBOOK'
  AND status = 'UNDER_REVIEW'
  AND frozen_snapshot IS NOT NULL;

ALTER TABLE reward_campaigns
  ADD CONSTRAINT reward_campaign_status_check CHECK (status IN (
    'DRAFT', 'FROZEN', 'UNDER_REVIEW', 'UNDER_REVIEW_PRIVATE', 'COMMUNITY_REVIEW',
    'APPROVED', 'PUBLISHED', 'ACTIVE', 'PRODUCTION_VERIFIED', 'FULFILLMENT_COMPLETE',
    'COMPLETED', 'STOPPED'
  ));
