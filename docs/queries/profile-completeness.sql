-- Profile completeness for real members. READ-ONLY.
-- Mirrors the "profiles" block of apps/api/src/repos/askMatchMetricsRepo.ts.
-- Members = completed profile, not deleted/suspended, not a demo or test account
-- (same exclusion as personIsProductionAlumniSql in apps/api/src/lib/demoPersonSql.ts).

SELECT
  COUNT(*) AS members,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND o.is_current))      AS with_current_role,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND NOT o.is_current))  AS with_past_role,
  COUNT(*) FILTER (WHERE jsonb_typeof(p.open_to_preferences -> 'selected') = 'array'
                     AND jsonb_array_length(p.open_to_preferences -> 'selected') > 0)                          AS with_open_to,
  COUNT(*) FILTER (WHERE length(btrim(COALESCE(p.bio, ''))) > 0)                                               AS with_bio,
  COUNT(*) FILTER (WHERE length(btrim(COALESCE(p.residence_city, ''))) > 0)                                    AS with_city
FROM people p
WHERE p.deleted_at IS NULL
  AND p.suspended_at IS NULL
  AND p.full_name IS NOT NULL
  AND p.profile_completed_at IS NOT NULL
  AND NOT (
    COALESCE(p.is_test_user, FALSE)
    OR split_part(lower(p.institutional_email::text), '@', 1) LIKE 'batchdemo.%'
    OR split_part(lower(p.institutional_email::text), '@', 1) LIKE 'platformdemo.%'
    OR split_part(lower(p.institutional_email::text), '@', 1) LIKE 'demo.alumni.%'
  );

-- Open-to tags by popularity (which "answer key" options members pick):
SELECT tag, COUNT(*) AS members
FROM people p, jsonb_array_elements_text(p.open_to_preferences -> 'selected') AS tag
WHERE p.deleted_at IS NULL AND p.suspended_at IS NULL AND p.profile_completed_at IS NOT NULL
  AND jsonb_typeof(p.open_to_preferences -> 'selected') = 'array'
GROUP BY tag
ORDER BY members DESC;
