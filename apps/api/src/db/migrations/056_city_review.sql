-- City review: unknown cities wait for an admin, duplicates are combined into a redirect instead of
-- being deleted, and every change is recorded in place_history (from this deployment on; no backfill).
-- Two migrations are already numbered 055 and applied in production, so this starts at 056.

-- 1. A city's review state. Every existing city stays approved.
ALTER TABLE canonical_places
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS combined_into_place_id UUID REFERENCES canonical_places (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS submitted_by_person_id UUID REFERENCES people (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_person_id UUID REFERENCES people (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE canonical_places DROP CONSTRAINT IF EXISTS canonical_places_status_check;
ALTER TABLE canonical_places ADD CONSTRAINT canonical_places_status_check CHECK (
  status IN ('pending', 'approved', 'rejected', 'combined')
);

-- A combined city always points somewhere else; nothing else does.
ALTER TABLE canonical_places DROP CONSTRAINT IF EXISTS canonical_places_combined_check;
ALTER TABLE canonical_places ADD CONSTRAINT canonical_places_combined_check CHECK (
  (status = 'combined') = (combined_into_place_id IS NOT NULL)
  AND (combined_into_place_id IS NULL OR combined_into_place_id <> id)
);

-- Only a rejected city carries a reason (the reason of earlier rejections stays in place_history).
ALTER TABLE canonical_places DROP CONSTRAINT IF EXISTS canonical_places_rejection_check;
ALTER TABLE canonical_places ADD CONSTRAINT canonical_places_rejection_check CHECK (
  (status = 'rejected') = (rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_canonical_places_review_queue
  ON canonical_places (status, submitted_at)
  WHERE status IN ('pending', 'rejected');

CREATE INDEX IF NOT EXISTS idx_canonical_places_submitted_by
  ON canonical_places (submitted_by_person_id, submitted_at)
  WHERE submitted_by_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_canonical_places_combined_into
  ON canonical_places (combined_into_place_id)
  WHERE combined_into_place_id IS NOT NULL;

COMMENT ON COLUMN canonical_places.status IS
  'pending (typed by a member, waiting for review), approved, rejected (reason in rejection_reason), combined (a redirect to combined_into_place_id).';

-- 2. Permanent history. Admin-only. Cities in it cannot be hard-deleted; a person who is deleted
-- leaves the row in place with actor_person_id cleared (anonymised), so deletion never fails.
CREATE TABLE IF NOT EXISTS place_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES canonical_places (id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  actor_person_id UUID REFERENCES people (id) ON DELETE SET NULL,
  target_place_id UUID REFERENCES canonical_places (id) ON DELETE RESTRICT,
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- clock_timestamp(), not now(): several rows written in one transaction keep their order.
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT place_history_action_check CHECK (
    action IN ('submitted', 'approved', 'rejected', 'reopened', 'combined', 'renamed', 'alias_added', 'alias_removed')
  ),
  CONSTRAINT place_history_target_check CHECK ((action = 'combined') = (target_place_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_place_history_place ON place_history (place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_history_target ON place_history (target_place_id) WHERE target_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_place_history_created ON place_history (created_at DESC);

COMMENT ON TABLE place_history IS
  'Append-only record of city submissions, approvals, rejections, reopenings, combines, renames and spelling changes.';

-- Append-only: no deletes, and the only update allowed is the anonymising one (actor cleared when a
-- person is hard-deleted, via ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION place_history_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'place_history is append-only';
  END IF;
  IF NEW.actor_person_id IS NULL
     AND OLD.actor_person_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.place_id = OLD.place_id
     AND NEW.action = OLD.action
     AND NEW.target_place_id IS NOT DISTINCT FROM OLD.target_place_id
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.detail = OLD.detail
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'place_history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_place_history_append_only ON place_history;
CREATE TRIGGER trg_place_history_append_only
  BEFORE UPDATE OR DELETE ON place_history
  FOR EACH ROW EXECUTE FUNCTION place_history_append_only();
