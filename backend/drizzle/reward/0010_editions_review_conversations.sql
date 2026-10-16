CREATE TABLE editions_creator_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  submission_revision integer NOT NULL,
  commitment_hash varchar(66) NOT NULL,
  response_body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editions_creator_response_revision_check CHECK (submission_revision >= 0),
  CONSTRAINT editions_creator_response_body_check CHECK (char_length(btrim(response_body)) BETWEEN 10 AND 3000)
);
CREATE INDEX editions_creator_response_campaign_idx ON editions_creator_responses(campaign_id, created_at);
CREATE UNIQUE INDEX editions_creator_response_revision_idx ON editions_creator_responses(campaign_id, submission_revision);

CREATE TABLE editions_creator_response_feedback (
  response_id uuid NOT NULL REFERENCES editions_creator_responses(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES editions_feedback(id) ON DELETE CASCADE,
  PRIMARY KEY (response_id, feedback_id)
);
CREATE INDEX editions_creator_response_feedback_feedback_idx ON editions_creator_response_feedback(feedback_id);

CREATE TABLE editions_review_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id),
  entitlement_id uuid NOT NULL REFERENCES editions_entitlements(id),
  backer_user_id uuid NOT NULL REFERENCES users(id),
  creator_user_id uuid NOT NULL REFERENCES users(id),
  target_hash varchar(66) NOT NULL,
  commitment_hash varchar(66) NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editions_review_thread_status_check CHECK (status IN ('OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'))
);
CREATE UNIQUE INDEX editions_review_thread_identity_idx ON editions_review_threads(campaign_id, entitlement_id, target_hash);
CREATE INDEX editions_review_thread_campaign_idx ON editions_review_threads(campaign_id);
CREATE INDEX editions_review_thread_backer_idx ON editions_review_threads(backer_user_id);
CREATE INDEX editions_review_thread_status_idx ON editions_review_threads(status);

CREATE TABLE editions_review_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES editions_review_threads(id),
  author_user_id uuid NOT NULL REFERENCES users(id),
  author_role text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editions_review_message_author_role_check CHECK (author_role IN ('BACKER', 'CREATOR', 'RESOLVER')),
  CONSTRAINT editions_review_message_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000)
);
CREATE INDEX editions_review_message_thread_idx ON editions_review_messages(thread_id, created_at);

CREATE TABLE editions_review_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES editions_review_threads(id),
  opener_user_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  resolver_user_id uuid REFERENCES users(id),
  outcome text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT editions_review_escalation_status_check CHECK (status IN ('OPEN', 'AWAITING_CREATOR_RESPONSE', 'RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')),
  CONSTRAINT editions_review_escalation_outcome_check CHECK (outcome IS NULL OR outcome IN ('RESOLVED', 'DISMISSED', 'FORMAL_DISPUTE')),
  CONSTRAINT editions_review_escalation_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 3000),
  CONSTRAINT editions_review_escalation_note_check CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 10 AND 3000)
);
CREATE UNIQUE INDEX editions_review_escalation_thread_idx ON editions_review_escalations(thread_id);
CREATE INDEX editions_review_escalation_status_idx ON editions_review_escalations(status);
