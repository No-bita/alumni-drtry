-- Notification seen state. Notifications are synthesized from source tables (contact requests,
-- bulletin replies, city offers, thread replies), so "seen" is one watermark per person: an item
-- is unseen when its occurredAt is newer than the watermark. Marking all as seen only moves the
-- watermark - history is never removed or altered.
-- NOTE: numbered 058 because the parked onboarding-dept-other branch already owns 057.
CREATE TABLE IF NOT EXISTS person_notification_state (
  person_id UUID PRIMARY KEY REFERENCES people (id) ON DELETE CASCADE,
  seen_watermark TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
);

COMMENT ON TABLE person_notification_state IS
  'Per-person notification seen watermark. unseen = occurredAt > seen_watermark. State only; notification history lives in the source tables.';

-- Owner-approved (5 Nov 2026): existing members start with their current history already seen -
-- only activity after this deploy counts as new. History itself is untouched.
INSERT INTO person_notification_state (person_id, seen_watermark)
SELECT id, clock_timestamp() FROM people
ON CONFLICT (person_id) DO NOTHING;
