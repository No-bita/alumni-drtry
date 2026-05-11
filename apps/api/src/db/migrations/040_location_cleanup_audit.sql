-- Human-readable audit trail + persisted ignores for Location Cleanup admin workflow.

CREATE TABLE IF NOT EXISTS location_cleanup_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_person_id UUID NOT NULL REFERENCES people (id),
  summary TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_cleanup_audit_created ON location_cleanup_audit (created_at DESC);

COMMENT ON TABLE location_cleanup_audit IS 'Append-only feed for admin Location Cleanup actions (merge, alias, remap).';

CREATE TABLE IF NOT EXISTS location_cleanup_suggestion_ignore (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('canonical_merge', 'unmapped_raw')),
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_person_id UUID NOT NULL REFERENCES people (id),
  UNIQUE (scope, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_location_cleanup_ignore_lookup ON location_cleanup_suggestion_ignore (scope, fingerprint);

COMMENT ON TABLE location_cleanup_suggestion_ignore IS 'Dismissed suggestions (merge pairs or unmapped clusters) stay hidden until fingerprint removed.';
