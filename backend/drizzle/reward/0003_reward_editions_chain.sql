CREATE TABLE editions_chain_campaigns (
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  onchain_campaign_id numeric(78,0) NOT NULL,
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  snapshot jsonb NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (stream_id, onchain_campaign_id)
);
CREATE INDEX editions_chain_campaign_metadata_idx ON editions_chain_campaigns(campaign_id);

CREATE TABLE editions_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  chain_id varchar(32) NOT NULL,
  contract_address varchar(42) NOT NULL,
  transaction_hash varchar(66) NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash varchar(66) NOT NULL,
  block_number numeric(78,0) NOT NULL,
  backer_wallet varchar(42) NOT NULL,
  backer_user_id uuid REFERENCES users(id),
  amount_paid numeric(78,0) NOT NULL CHECK (amount_paid > 0),
  canonical boolean NOT NULL DEFAULT true,
  refunded boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, contract_address, transaction_hash, log_index)
);
CREATE INDEX editions_entitlement_owner_idx ON editions_entitlements(backer_user_id);
CREATE INDEX editions_entitlement_campaign_idx ON editions_entitlements(campaign_id);
