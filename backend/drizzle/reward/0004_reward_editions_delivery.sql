ALTER TABLE editions_entitlements ADD COLUMN confirmed_evidence_hash varchar(66);

CREATE TABLE editions_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  stream_id text NOT NULL REFERENCES indexer_streams(stream_id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('PRODUCTION_EVIDENCE', 'FINAL_PDF')),
  object_id uuid NOT NULL UNIQUE,
  sha256 varchar(66) NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  summary text NOT NULL,
  production_hash varchar(66) NOT NULL,
  evidence_hash varchar(66) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, stream_id, evidence_hash)
);
CREATE TABLE editions_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  target_hash varchar(66) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COMMENT', 'ISSUE', 'FILE_UNAVAILABLE')),
  body text NOT NULL,
  body_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, author_user_id, target_hash, kind, body_hash)
);
CREATE TABLE editions_download_tickets (
  token_hash varchar(64) PRIMARY KEY,
  entitlement_id uuid NOT NULL REFERENCES editions_entitlements(id),
  evidence_id uuid NOT NULL REFERENCES editions_evidence(id),
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  requested_at timestamptz
);
