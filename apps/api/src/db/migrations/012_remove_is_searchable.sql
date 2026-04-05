-- Searchability is defined by verified institutional email (people row exists after OTP/magic-link verify).
-- Drop the redundant is_searchable column and refresh partial indexes that referenced it.

DROP INDEX IF EXISTS idx_people_is_searchable_true;
DROP INDEX IF EXISTS idx_people_search_order;
DROP INDEX IF EXISTS idx_people_search_department_batch;

CREATE INDEX IF NOT EXISTS idx_people_search_order
  ON people ((lower(COALESCE(full_name, '')) COLLATE "C"), id)
  WHERE deleted_at IS NULL
    AND suspended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_people_search_department_batch
  ON people (department_id, batch_year)
  WHERE deleted_at IS NULL
    AND suspended_at IS NULL;

ALTER TABLE people DROP COLUMN IF EXISTS is_searchable;
