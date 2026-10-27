-- Analytics screen (/admin/analytics): the few facts the existing tables could not answer.

-- Sign-in: how each new code's email went, and how the attempt was completed.
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS delivery TEXT
  CHECK (delivery IS NULL OR delivery IN ('sent', 'unconfirmed'));

-- Failed sends roll their attempt back, so they are counted here instead. No email address.
CREATE TABLE IF NOT EXISTS auth_delivery_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL CHECK (reason IN ('rejected', 'unreachable')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_delivery_failures_time ON auth_delivery_failures (occurred_at DESC);

-- How each session was signed in (null for sessions created before this migration).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_method TEXT
  CHECK (auth_method IS NULL OR auth_method IN ('otp', 'magic_link', 'google', 'password', 'invite', 'demo'));

-- Active members over time: one row per member per day they used the app.
CREATE TABLE IF NOT EXISTS member_activity_days (
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (person_id, day)
);
CREATE INDEX IF NOT EXISTS idx_member_activity_days_day ON member_activity_days (day);

-- Matching quality: which result position (1 = top) a note from Ask -> Match was sent to.
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS source_rank SMALLINT
  CHECK (source_rank IS NULL OR source_rank BETWEEN 1 AND 20);

-- Growth: who invited a member, and through which channel.
ALTER TABLE people ADD COLUMN IF NOT EXISTS invited_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS invite_channel TEXT
  CHECK (invite_channel IS NULL OR invite_channel IN ('copy', 'whatsapp'));
CREATE INDEX IF NOT EXISTS idx_people_invited_by ON people (invited_by_person_id) WHERE invited_by_person_id IS NOT NULL;

-- Demand vs supply: what the matcher read from each question. Still no question text and no person.
ALTER TABLE match_queries ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE match_queries ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE match_queries ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE match_queries ADD COLUMN IF NOT EXISTS country TEXT;

-- Usage events: retention purge scans by time alone.
CREATE INDEX IF NOT EXISTS idx_beta_usage_events_time ON beta_usage_events (occurred_at);
