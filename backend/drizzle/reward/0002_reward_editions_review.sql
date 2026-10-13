ALTER TABLE reward_campaigns ADD COLUMN review_preparation jsonb;
ALTER TABLE reward_campaigns ADD COLUMN frozen_snapshot jsonb;
ALTER TABLE reward_campaigns ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE reward_campaigns ADD COLUMN payout_wallet_link_id uuid REFERENCES wallet_links(id);
ALTER TABLE reward_reviews ADD COLUMN frozen_snapshot jsonb;

CREATE TABLE reward_editions_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  object_id uuid NOT NULL UNIQUE,
  sha256 varchar(66) NOT NULL,
  media_type varchar(50) NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  purpose varchar(32) NOT NULL DEFAULT 'SAMPLE_PAGE' CHECK (purpose = 'SAMPLE_PAGE'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reward_editions_sample_campaign_idx ON reward_editions_samples(campaign_id);
