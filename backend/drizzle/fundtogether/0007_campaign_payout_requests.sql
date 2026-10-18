CREATE TABLE campaigns_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  commitment_hash varchar(66) NOT NULL,
  revision integer NOT NULL,
  request_hash varchar(66) NOT NULL,
  amount numeric(78, 0) NOT NULL,
  title varchar(200) NOT NULL,
  summary text NOT NULL,
  reason text NOT NULL,
  breakdown text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  request_tx_hash varchar(66),
  requested_at timestamptz,
  decision_hash varchar(66),
  decision_tx_hash varchar(66),
  paid_out_tx_hash varchar(66),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_payout_request_revision_check CHECK (revision >= 1),
  CONSTRAINT campaigns_payout_request_amount_check CHECK (amount > 0),
  CONSTRAINT campaigns_payout_request_status_check CHECK (status IN ('DRAFT', 'SUBMITTED_ON_CHAIN', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'PAID_OUT'))
);

CREATE UNIQUE INDEX campaigns_payout_request_revision_idx
  ON campaigns_payout_requests (campaign_id, stream_id, revision);
CREATE UNIQUE INDEX campaigns_payout_request_hash_idx
  ON campaigns_payout_requests (campaign_id, stream_id, request_hash);
CREATE INDEX campaigns_payout_request_campaign_idx
  ON campaigns_payout_requests (campaign_id, created_at);

CREATE TABLE campaigns_payout_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES campaigns_payout_requests(id) ON DELETE CASCADE,
  object_id uuid NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  sha256 varchar(66) NOT NULL,
  media_type varchar(50) NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_payout_request_file_media_check CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  CONSTRAINT campaigns_payout_request_file_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);

CREATE INDEX campaigns_payout_request_file_request_idx
  ON campaigns_payout_request_files (request_id);

CREATE TABLE campaigns_payout_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES campaigns_payout_requests(id),
  resolver_user_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL,
  reason text NOT NULL,
  decision_hash varchar(66) NOT NULL,
  tx_hash varchar(66),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_payout_decision_outcome_check CHECK (outcome IN ('APPROVE', 'CHANGES_REQUESTED', 'REJECT')),
  CONSTRAINT campaigns_payout_decision_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 3000)
);

CREATE UNIQUE INDEX campaigns_payout_decision_hash_idx
  ON campaigns_payout_decisions (request_id, decision_hash);
CREATE INDEX campaigns_payout_decision_request_idx
  ON campaigns_payout_decisions (request_id, created_at);
