-- In-app feedback: a signed-in member's private note to the admins. Replaces the WhatsApp
-- feedback link in the nav. Product decisions: message only (no category field), and the
-- author is always stored so an admin can follow up - the UI promises "Your feedback is
-- private.", never anonymity. Admins read submissions on the analytics screen.
--
--   person_id   the signed-in member; kept even if they later leave (no cascade delete)
--   RLS enabled like every public table (repo rule, checked by securityHardening e2e); inert
--   for the owning app role, which keeps full access.
--   message     1-3000 non-blank characters, same cap as a contact-request note

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
