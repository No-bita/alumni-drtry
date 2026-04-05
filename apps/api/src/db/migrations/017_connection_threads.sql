-- Soft connection threads: multi-message conversations before optional selective contact sharing.

CREATE TABLE IF NOT EXISTS connection_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  recipient_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connection_threads_participants_distinct CHECK (initiator_person_id <> recipient_person_id),
  CONSTRAINT connection_threads_status_check CHECK (status IN ('open', 'closed', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_connection_threads_initiator_updated
  ON connection_threads (initiator_person_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_threads_recipient_updated
  ON connection_threads (recipient_person_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_connection_threads_updated_at ON connection_threads;
CREATE TRIGGER trg_connection_threads_updated_at
BEFORE UPDATE ON connection_threads
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS connection_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES connection_threads(id) ON DELETE CASCADE,
  author_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connection_messages_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT connection_messages_body_max CHECK (length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_connection_messages_thread_created
  ON connection_messages (thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS connection_disclosures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES connection_threads(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  profile_link_id UUID REFERENCES profile_links(id) ON DELETE SET NULL,
  disclosed_value CITEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connection_disclosures_kind_check CHECK (
    kind IN ('institutional_email', 'personal_email', 'profile_link')
  ),
  CONSTRAINT connection_disclosures_link_kind CHECK (
    (kind = 'profile_link' AND profile_link_id IS NOT NULL)
    OR (kind <> 'profile_link' AND profile_link_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_connection_disclosures_thread_person_kind_null_link
  ON connection_disclosures (thread_id, person_id, kind)
  WHERE profile_link_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_connection_disclosures_thread_person_link
  ON connection_disclosures (thread_id, person_id, profile_link_id)
  WHERE profile_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connection_disclosures_thread
  ON connection_disclosures (thread_id);

-- Per-participant nudge dismiss: re-show after new messages when count > dismissed_after_total_messages
CREATE TABLE IF NOT EXISTS connection_thread_nudge_dismissals (
  thread_id UUID NOT NULL REFERENCES connection_threads(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  dismissed_after_total_messages INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, person_id)
);

DROP TRIGGER IF EXISTS trg_connection_thread_nudge_dismissals_updated_at ON connection_thread_nudge_dismissals;
CREATE TRIGGER trg_connection_thread_nudge_dismissals_updated_at
BEFORE UPDATE ON connection_thread_nudge_dismissals
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
