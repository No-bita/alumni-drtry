-- Wall post audience: who can see a post, chosen when it is created.
--
-- Every column is empty on existing posts and on posts for Everyone, so nothing changes for them.
-- A narrowed post stores a copy of what was picked, taken from the author's profile at posting time
-- (the audience is fixed once posted). Each viewer is matched against these with their CURRENT
-- profile; empty columns match everyone. All of them must match (AND).
--
--   audience_email_domains     the chosen institute's allowed email domains (IIT Bombay = iitb.ac.in +
--                              iitbombay.org); empty = all institutes
--   audience_institution_name  that institute's display name, for the post's label
--   audience_batch_year        the author's batch year
--   audience_department_code   the author's department code ("other" is never stored: it can't match)
--   audience_department_name   its display name, for the label
--   audience_place_id          the author's linked city (already resolved through a city merge).
--                              ON DELETE RESTRICT, not SET NULL: clearing it would silently widen a
--                              narrowed post to every city.
--
-- Numbered 067: 066 is Home Wall pinning (066_wall_post_pins.sql) and 065 is held by the unmerged
-- code-only sign-in branch. The runner applies any unapplied file, so the gap at 065 is harmless
-- whichever merges first.

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS audience_email_domains TEXT[],
  ADD COLUMN IF NOT EXISTS audience_institution_name TEXT,
  ADD COLUMN IF NOT EXISTS audience_batch_year SMALLINT,
  ADD COLUMN IF NOT EXISTS audience_department_code TEXT,
  ADD COLUMN IF NOT EXISTS audience_department_name TEXT,
  ADD COLUMN IF NOT EXISTS audience_place_id UUID REFERENCES canonical_places (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intentcasts_audience_institution_check') THEN
    ALTER TABLE intentcasts ADD CONSTRAINT intentcasts_audience_institution_check CHECK (
      (audience_email_domains IS NULL) = (audience_institution_name IS NULL)
      AND (audience_email_domains IS NULL OR cardinality(audience_email_domains) BETWEEN 1 AND 10)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intentcasts_audience_department_check') THEN
    ALTER TABLE intentcasts ADD CONSTRAINT intentcasts_audience_department_check CHECK (
      (audience_department_code IS NULL) = (audience_department_name IS NULL)
      AND (audience_department_code IS NULL OR lower(audience_department_code) <> 'other')
    );
  END IF;
END
$$;
