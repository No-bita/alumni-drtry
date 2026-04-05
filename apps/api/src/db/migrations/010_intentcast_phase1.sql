-- Intentcast Phase 1 alignment:
-- - category enum (controlled values)
-- - open/closed status model
-- - editable window (5 minutes)
-- - close reasons include edit_replaced and expired
-- - feed/filter indexes

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE intentcasts
SET category = 'guidance'
WHERE category IS NULL;

ALTER TABLE intentcasts
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE intentcasts
  DROP CONSTRAINT IF EXISTS intentcasts_category_check;

ALTER TABLE intentcasts
  ADD CONSTRAINT intentcasts_category_check
  CHECK (category IN ('hiring', 'mentorship', 'collaboration', 'guidance'));

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS editable_until TIMESTAMPTZ;

UPDATE intentcasts
SET editable_until = created_at + interval '5 minutes'
WHERE editable_until IS NULL;

ALTER TABLE intentcasts
  ALTER COLUMN editable_until SET NOT NULL;

UPDATE intentcasts
SET
  status = 'closed',
  closed_reason = 'expired',
  closed_at = COALESCE(closed_at, now()),
  closed_by_person_id = NULL
WHERE status = 'expired';

ALTER TABLE intentcasts
  DROP CONSTRAINT IF EXISTS intentcasts_status_check;

ALTER TABLE intentcasts
  ADD CONSTRAINT intentcasts_status_check
  CHECK (status IN ('open', 'closed'));

ALTER TABLE intentcasts
  DROP CONSTRAINT IF EXISTS intentcasts_closed_reason_check;

ALTER TABLE intentcasts
  ADD CONSTRAINT intentcasts_closed_reason_check
  CHECK (
    closed_reason IS NULL OR closed_reason IN ('manual', 'expired', 'edit_replaced', 'moderated')
  );

ALTER TABLE intentcasts
  DROP CONSTRAINT IF EXISTS intentcasts_closed_state_check;

ALTER TABLE intentcasts
  ADD CONSTRAINT intentcasts_closed_state_check CHECK (
    (status = 'open' AND closed_at IS NULL AND closed_reason IS NULL AND closed_by_person_id IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND closed_reason IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_intentcasts_category_status_created
  ON intentcasts (category, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_intentcasts_status_created
  ON intentcasts (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_intentcasts_editable_until
  ON intentcasts (editable_until);
