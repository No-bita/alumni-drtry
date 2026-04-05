-- Flag rows created by automated tests for pre-production cleanup.
-- See: apps/api/scripts/delete-test-users.sql

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN people.is_test_user IS 'True for e2e test institutional emails; safe to DELETE before production ship.';

CREATE INDEX IF NOT EXISTS idx_people_is_test_user
  ON people (is_test_user)
  WHERE is_test_user = TRUE;

-- Backfill existing rows (patterns match apps/api/src/lib/testUser.ts)
UPDATE people
SET is_test_user = TRUE
WHERE lower(split_part(institutional_email::text, '@', 1)) LIKE 'e2e%';
