-- The bio is removed from the platform (approved: drop it completely). This deletes every saved
-- bio permanently.
--
-- 1. Analytics used a "[DEMO]" marker inside the bio to leave seeded demo profiles out of member
--    counts. Keep that classification on the proper flag before the text goes: any such profile
--    not already flagged becomes a test user (which also keeps it out of the real directory).
UPDATE people
SET is_test_user = TRUE
WHERE bio ILIKE '%[DEMO]%'
  AND COALESCE(is_test_user, FALSE) = FALSE;

-- 2. The old directory search index was built on the bio (and the query no longer matched it).
DROP INDEX IF EXISTS idx_people_fts_profile;

-- 3. Delete the bio.
ALTER TABLE people DROP COLUMN IF EXISTS bio;

-- 4. Directory search now matches a member's name, city and country (plus their roles and
--    companies through occupations); index exactly the text the search query builds.
CREATE INDEX IF NOT EXISTS idx_people_fts_name_place
  ON people
  USING GIN (
    to_tsvector('simple'::regconfig, COALESCE(full_name, '') || ' ' || COALESCE(residence_country, '') || ' ' || COALESCE(residence_city, ''))
  );
