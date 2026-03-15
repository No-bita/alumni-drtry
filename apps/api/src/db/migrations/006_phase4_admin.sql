-- Phase 4 admin: search log for metrics
CREATE TABLE IF NOT EXISTS search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_log_created_at ON search_log (created_at);
