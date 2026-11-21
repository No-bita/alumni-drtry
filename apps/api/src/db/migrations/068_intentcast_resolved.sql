-- Business page, progress steps (option A2): an author can close their request as RESOLVED, with one
-- of three outcomes. "Has replies" is not stored: it comes from the existing reply count.
--
--   closed_reason 'resolved'   new allowed value, next to manual, expired, edit_replaced, moderated
--   resolved_outcome           got_help_here | sorted_elsewhere | no_longer_needed
--                              set only when closed_reason = 'resolved' (and always then)
--
-- Existing rows are untouched: none has closed_reason 'resolved', and resolved_outcome starts empty.
-- A resolved post is closed like any other, so it leaves the feed and its Home Wall pin is cleared by
-- the existing pin trigger (066).

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS resolved_outcome TEXT;

ALTER TABLE intentcasts
  DROP CONSTRAINT IF EXISTS intentcasts_closed_reason_check;

ALTER TABLE intentcasts
  ADD CONSTRAINT intentcasts_closed_reason_check
  CHECK (
    closed_reason IS NULL OR closed_reason IN ('manual', 'expired', 'edit_replaced', 'moderated', 'resolved')
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intentcasts_resolved_outcome_check') THEN
    ALTER TABLE intentcasts ADD CONSTRAINT intentcasts_resolved_outcome_check CHECK (
      (resolved_outcome IS NULL OR resolved_outcome IN ('got_help_here', 'sorted_elsewhere', 'no_longer_needed'))
      -- COALESCE so an open post (closed_reason NULL) can't carry an outcome: a NULL comparison would pass.
      AND ((COALESCE(closed_reason, '') = 'resolved') = (resolved_outcome IS NOT NULL))
    );
  END IF;
END
$$;
