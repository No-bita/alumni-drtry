CREATE TABLE IF NOT EXISTS beta_auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('invite_attempt', 'invite_success', 'invite_failure', 'invite_rate_limited')),
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  email_domain TEXT,
  error_code TEXT,
  invite_code_id TEXT,
  ip INET,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_auth_events_type_time
  ON beta_auth_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_auth_events_person_time
  ON beta_auth_events (person_id, occurred_at DESC);
