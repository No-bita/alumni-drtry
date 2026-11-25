-- Brokered requests, second half (2026-11-25): a yes no longer shares anyone's contact. The asker
-- and the helper who said yes get a private conversation tied to that request instead, with limits
-- set in the API (brokerConversationService.ts). Either of them can still type their contact into it.
-- NOTE: numbered 079 because a parallel branch (admin view-as) owns 078.

-- 1. The accepted reachout a brokered yes creates no longer carries a contact.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_state_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_state_check CHECK (
  (status = 'pending' AND responded_at IS NULL AND recipient_contact_shared IS NULL)
  OR (
    status = 'accepted' AND responded_at IS NOT NULL
    AND (recipient_contact_shared IS NOT NULL OR source IN ('referral_request', 'hiring_request'))
  )
  OR (status = 'declined' AND responded_at IS NOT NULL AND recipient_contact_shared IS NULL)
);

-- 2. Conversations reuse connection threads and messages, as a third kind tied to one request
--    (at most one per request). The general messaging endpoints never see this kind.
ALTER TABLE connection_threads
  ADD COLUMN IF NOT EXISTS broker_request_id UUID REFERENCES broker_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS closed_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE connection_threads DROP CONSTRAINT IF EXISTS connection_threads_kind_check;
ALTER TABLE connection_threads ADD CONSTRAINT connection_threads_kind_check
  CHECK (kind IN ('general', 'referral', 'broker'));

ALTER TABLE connection_threads DROP CONSTRAINT IF EXISTS connection_threads_broker_request_check;
ALTER TABLE connection_threads ADD CONSTRAINT connection_threads_broker_request_check
  CHECK ((kind = 'broker') = (broker_request_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uq_connection_threads_broker_request
  ON connection_threads (broker_request_id) WHERE broker_request_id IS NOT NULL;

-- 3. Read state per participant: unread counts, and a message notification clears once read.
CREATE TABLE IF NOT EXISTS connection_thread_reads (
  thread_id UUID NOT NULL REFERENCES connection_threads(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (thread_id, person_id)
);
ALTER TABLE connection_thread_reads ENABLE ROW LEVEL SECURITY;

-- 4. The per-sender rate limit counts a member's recent messages.
CREATE INDEX IF NOT EXISTS idx_connection_messages_author_created
  ON connection_messages (author_person_id, created_at DESC);

-- 5. Requests already connected get their conversation (the helper is the accepted ask).
INSERT INTO connection_threads (initiator_person_id, recipient_person_id, status, kind, broker_request_id)
SELECT br.asker_person_id, ba.helper_person_id, 'open', 'broker', br.id
FROM broker_requests br
JOIN broker_asks ba ON ba.request_id = br.id AND ba.status = 'accepted'
WHERE br.status = 'connected'
  AND br.asker_person_id <> ba.helper_person_id
  AND NOT EXISTS (SELECT 1 FROM connection_threads t WHERE t.broker_request_id = br.id);
