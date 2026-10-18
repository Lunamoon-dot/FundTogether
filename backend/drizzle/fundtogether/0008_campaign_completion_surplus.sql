CREATE TABLE campaigns_completion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  commitment_hash varchar(66) NOT NULL,
  revision integer NOT NULL,
  request_hash varchar(66) NOT NULL,
  title varchar(200) NOT NULL,
  summary text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  request_tx_hash varchar(66),
  requested_at timestamptz,
  decision_hash varchar(66),
  decision_tx_hash varchar(66),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_completion_request_revision_check CHECK (revision >= 1),
  CONSTRAINT campaigns_completion_request_status_check CHECK (status IN ('DRAFT', 'SUBMITTED_ON_CHAIN', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'))
);
CREATE UNIQUE INDEX campaigns_completion_request_revision_idx ON campaigns_completion_requests (campaign_id, stream_id, revision);
CREATE UNIQUE INDEX campaigns_completion_request_hash_idx ON campaigns_completion_requests (campaign_id, stream_id, request_hash);
CREATE INDEX campaigns_completion_request_campaign_idx ON campaigns_completion_requests (campaign_id, created_at);

CREATE TABLE campaigns_completion_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES campaigns_completion_requests(id) ON DELETE CASCADE,
  object_id uuid NOT NULL UNIQUE,
  original_name varchar(255) NOT NULL,
  sha256 varchar(66) NOT NULL,
  media_type varchar(50) NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_completion_request_file_media_check CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  CONSTRAINT campaigns_completion_request_file_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);
CREATE INDEX campaigns_completion_request_file_request_idx ON campaigns_completion_request_files (request_id);

CREATE TABLE campaigns_completion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES campaigns_completion_requests(id),
  resolver_user_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL,
  reason text NOT NULL,
  decision_hash varchar(66) NOT NULL,
  tx_hash varchar(66),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_completion_decision_outcome_check CHECK (outcome IN ('APPROVE', 'CHANGES_REQUESTED', 'REJECT')),
  CONSTRAINT campaigns_completion_decision_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 3000)
);
CREATE UNIQUE INDEX campaigns_completion_decision_hash_idx ON campaigns_completion_decisions (request_id, decision_hash);
CREATE INDEX campaigns_completion_decision_request_idx ON campaigns_completion_decisions (request_id, created_at);

CREATE TABLE campaigns_surplus_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  backer_user_id uuid REFERENCES users(id),
  backer_wallet varchar(42) NOT NULL,
  choice text NOT NULL,
  recipient varchar(42) NOT NULL,
  amount numeric(78, 0) NOT NULL,
  transaction_hash varchar(66) NOT NULL,
  log_index integer NOT NULL,
  block_hash varchar(66) NOT NULL,
  block_number numeric(78, 0) NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_surplus_claim_choice_check CHECK (choice IN ('REFUND_TO_BACKER', 'DONATE_TO_CREATOR')),
  CONSTRAINT campaigns_surplus_claim_amount_check CHECK (amount > 0)
);
CREATE UNIQUE INDEX campaigns_surplus_claim_log_identity_idx ON campaigns_surplus_claims (stream_id, transaction_hash, log_index);
CREATE INDEX campaigns_surplus_claim_campaign_idx ON campaigns_surplus_claims (campaign_id, created_at);
