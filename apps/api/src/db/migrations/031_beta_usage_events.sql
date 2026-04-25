CREATE TABLE IF NOT EXISTS beta_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_usage_events_type_time
  ON beta_usage_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_usage_events_person_time
  ON beta_usage_events (person_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_beta_usage_events_route_time
  ON beta_usage_events (route, occurred_at DESC);
