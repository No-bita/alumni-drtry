-- Phase 3 contact schema
-- 5) intentcast table migration
-- 8) intentcast expiry support
-- 11) contact request table migration

CREATE TABLE IF NOT EXISTS intentcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  closed_at TIMESTAMPTZ,
  closed_reason TEXT,
  closed_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intentcasts_content_not_blank CHECK (length(trim(content)) > 0),
  CONSTRAINT intentcasts_status_check CHECK (status IN ('open', 'closed', 'expired')),
  CONSTRAINT intentcasts_closed_reason_check CHECK (
    closed_reason IS NULL OR closed_reason IN ('manual', 'expired')
  ),
  CONSTRAINT intentcasts_closed_state_check CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_reason IS NULL AND closed_by_person_id IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_reason = 'manual' AND closed_by_person_id IS NOT NULL)
    OR (status = 'expired' AND closed_at IS NOT NULL AND closed_reason = 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_intentcasts_feed
  ON intentcasts (status, expires_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_intentcasts_author_created
  ON intentcasts (author_person_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_intentcasts_updated_at ON intentcasts;
CREATE TRIGGER trg_intentcasts_updated_at
BEFORE UPDATE ON intentcasts
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS intentcast_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intentcast_id UUID NOT NULL REFERENCES intentcasts(id) ON DELETE CASCADE,
  responder_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intentcast_responses_message_not_blank CHECK (length(trim(message)) > 0),
  CONSTRAINT uq_intentcast_responder UNIQUE (intentcast_id, responder_person_id)
);

CREATE INDEX IF NOT EXISTS idx_intentcast_responses_intentcast
  ON intentcast_responses (intentcast_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intentcast_responses_responder
  ON intentcast_responses (responder_person_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_intentcast_responses_updated_at ON intentcast_responses;
CREATE TRIGGER trg_intentcast_responses_updated_at
BEFORE UPDATE ON intentcast_responses
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  recipient_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recipient_contact_shared CITEXT,
  forwarded_to_institutional_email CITEXT NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_requests_sender_recipient_diff CHECK (sender_person_id <> recipient_person_id),
  CONSTRAINT contact_requests_message_not_blank CHECK (length(trim(message)) > 0),
  CONSTRAINT contact_requests_status_check CHECK (status IN ('pending', 'accepted', 'declined')),
  CONSTRAINT contact_requests_state_check CHECK (
    (status = 'pending' AND responded_at IS NULL AND recipient_contact_shared IS NULL)
    OR (status = 'accepted' AND responded_at IS NOT NULL AND recipient_contact_shared IS NOT NULL)
    OR (status = 'declined' AND responded_at IS NOT NULL AND recipient_contact_shared IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient_status_created
  ON contact_requests (recipient_person_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_sender_status_created
  ON contact_requests (sender_person_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_contact_requests_updated_at ON contact_requests;
CREATE TRIGGER trg_contact_requests_updated_at
BEFORE UPDATE ON contact_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
