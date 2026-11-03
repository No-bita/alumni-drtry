-- =====================================================================================================
-- One-off: create the 8 most-typed cities (India) and link the members who already typed them.
-- Prepared 2026-11, for the production database. Run it in the Supabase SQL editor, one PART at a time.
--
-- What it does:
--   * Creates approved cities with spellings:
--       Bengaluru (bengaluru, bangalore, banglore, blr)   Pune   Gurugram (gurugram, gurgaon)
--       Hyderabad   Mumbai (mumbai, bombay)   Varanasi   Ahmedabad   Kanpur
--   * Links members who are NOT linked to any city yet, whose typed city is one of those spellings
--     (ignoring capitals and extra spaces) and whose typed country is India ("India" or "Bharat").
--     Anyone with an empty or other country is left alone. Anyone already linked is never moved.
--   * Never changes what members typed, never deletes anything, and records every change in the city
--     history (place_history) the same way the app does, with you as the admin who acted.
--   * Safe to run twice: existing cities and spellings are reused, nothing is duplicated.
--
-- After PART 2: city counts on the website can take a while to refresh (the API caches them for up to
-- 24 hours; a redeploy or restart clears it). Each member's own Cities page reflects the link at once.
-- Cities v1 looks up an approved "Bengaluru, India": it switches on within about 30 seconds on an API
-- that has this change, or within 10 minutes on the current API.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- PART 1 — PREVIEW (read-only). Shows who would be linked, then the count per city. Changes nothing.
-- -----------------------------------------------------------------------------------------------------
WITH spellings(city, spelling) AS (
  VALUES
    ('Bengaluru', 'bengaluru'), ('Bengaluru', 'bangalore'), ('Bengaluru', 'banglore'), ('Bengaluru', 'blr'),
    ('Pune', 'pune'),
    ('Gurugram', 'gurugram'), ('Gurugram', 'gurgaon'),
    ('Hyderabad', 'hyderabad'),
    ('Mumbai', 'mumbai'), ('Mumbai', 'bombay'),
    ('Varanasi', 'varanasi'),
    ('Ahmedabad', 'ahmedabad'),
    ('Kanpur', 'kanpur')
),
would_link AS (
  SELECT s.city, p.id AS person_id, p.residence_city AS typed_city, p.residence_country AS typed_country
  FROM people p
  JOIN spellings s
    ON lower(regexp_replace(btrim(COALESCE(p.residence_city, '')), '\s+', ' ', 'g')) = s.spelling
  WHERE p.residence_canonical_place_id IS NULL
    AND p.deleted_at IS NULL
    AND lower(regexp_replace(btrim(COALESCE(p.residence_country, '')), '\s+', ' ', 'g')) IN ('india', 'bharat')
)
SELECT city, person_id, typed_city, typed_country FROM would_link ORDER BY city, typed_city, person_id;

-- Counts per city (run this as well, same rules). existing_status: empty means the city will be created,
-- approved means it is reused, and pending, rejected or combined means PART 2 skips that city (review it in
-- City review or Location cleanup instead), so its count will not apply.
WITH spellings(city, spelling) AS (
  VALUES
    ('Bengaluru', 'bengaluru'), ('Bengaluru', 'bangalore'), ('Bengaluru', 'banglore'), ('Bengaluru', 'blr'),
    ('Pune', 'pune'),
    ('Gurugram', 'gurugram'), ('Gurugram', 'gurgaon'),
    ('Hyderabad', 'hyderabad'),
    ('Mumbai', 'mumbai'), ('Mumbai', 'bombay'),
    ('Varanasi', 'varanasi'),
    ('Ahmedabad', 'ahmedabad'),
    ('Kanpur', 'kanpur')
)
SELECT s.city, COUNT(p.id) AS members_to_link,
       (SELECT cp.status FROM canonical_places cp
        WHERE lower(trim(cp.country)) = 'india' AND lower(trim(cp.city_label)) = lower(s.city)) AS existing_status
FROM spellings s
LEFT JOIN people p
  ON lower(regexp_replace(btrim(COALESCE(p.residence_city, '')), '\s+', ' ', 'g')) = s.spelling
 AND p.residence_canonical_place_id IS NULL
 AND p.deleted_at IS NULL
 AND lower(regexp_replace(btrim(COALESCE(p.residence_country, '')), '\s+', ' ', 'g')) IN ('india', 'bharat')
GROUP BY s.city
ORDER BY members_to_link DESC, s.city;


-- -----------------------------------------------------------------------------------------------------
-- PART 2 — APPLY (one transaction: all of it happens, or none of it).
-- Replace REPLACE_WITH_YOUR_ADMIN_EMAIL below with your institutional email (an admin account) first.
-- -----------------------------------------------------------------------------------------------------
DO $apply$
DECLARE
  admin_email CONSTANT text := 'REPLACE_WITH_YOUR_ADMIN_EMAIL';
  admin_id uuid;
  rec record;
  v_place uuid;
  place_status text;
  new_spellings text[];
  linked int;
  total int := 0;
BEGIN
  SELECT id INTO admin_id FROM people
  WHERE lower(institutional_email::text) = lower(btrim(admin_email)) AND role <> 'alumni' AND deleted_at IS NULL;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin account found for %. Put your admin email in admin_email and run again.', admin_email;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Bengaluru', ARRAY['bengaluru', 'bangalore', 'banglore', 'blr']),
      ('Pune',      ARRAY['pune']),
      ('Gurugram',  ARRAY['gurugram', 'gurgaon']),
      ('Hyderabad', ARRAY['hyderabad']),
      ('Mumbai',    ARRAY['mumbai', 'bombay']),
      ('Varanasi',  ARRAY['varanasi']),
      ('Ahmedabad', ARRAY['ahmedabad']),
      ('Kanpur',    ARRAY['kanpur'])
    ) AS t(city, spellings)
  LOOP
    v_place := NULL;
    place_status := NULL;
    INSERT INTO canonical_places (country, city_label, status, submitted_by_person_id, submitted_at, reviewed_by_person_id, reviewed_at)
    VALUES ('India', rec.city, 'approved', admin_id, now(), admin_id, now())
    ON CONFLICT ((lower(trim(country))), (lower(trim(city_label)))) DO NOTHING
    RETURNING id INTO v_place;

    IF v_place IS NOT NULL THEN
      INSERT INTO place_history (place_id, action, actor_person_id, detail)
      VALUES (v_place, 'submitted', admin_id, jsonb_build_object('source', 'admin', 'via', 'ops_script_2026_11'));
    ELSE
      SELECT id, status INTO v_place, place_status FROM canonical_places
      WHERE lower(trim(country)) = 'india' AND lower(trim(city_label)) = lower(rec.city);
      IF place_status IS DISTINCT FROM 'approved' THEN
        RAISE NOTICE 'Skipped %: it already exists with status %. Review it in City review or Location cleanup.', rec.city, place_status;
        CONTINUE;
      END IF;
    END IF;

    -- Spellings (the city's own name included). Only the new ones are recorded.
    WITH added AS (
      INSERT INTO place_aliases (canonical_place_id, alias_normalized)
      SELECT v_place, s FROM unnest(rec.spellings || ARRAY[lower(rec.city)]) AS s
      ON CONFLICT (canonical_place_id, alias_normalized) DO NOTHING
      RETURNING alias_normalized
    )
    SELECT COALESCE(array_agg(alias_normalized ORDER BY alias_normalized), ARRAY[]::text[]) INTO new_spellings FROM added;

    -- Link unlinked members who typed any spelling, in India. Typed text is not touched.
    WITH done AS (
      UPDATE people p SET residence_canonical_place_id = v_place
      WHERE p.residence_canonical_place_id IS NULL
        AND p.deleted_at IS NULL
        AND lower(regexp_replace(btrim(COALESCE(p.residence_city, '')), '\s+', ' ', 'g'))
            IN (SELECT alias_normalized FROM place_aliases WHERE canonical_place_id = v_place)
        AND lower(regexp_replace(btrim(COALESCE(p.residence_country, '')), '\s+', ' ', 'g')) IN ('india', 'bharat')
      RETURNING 1
    )
    SELECT COUNT(*) INTO linked FROM done;
    total := total + linked;

    IF array_length(new_spellings, 1) IS NOT NULL THEN
      INSERT INTO place_history (place_id, action, actor_person_id, detail)
      VALUES (v_place, 'alias_added', admin_id, jsonb_build_object('aliases', to_jsonb(new_spellings), 'via', 'ops_script_2026_11'));
    END IF;
    IF place_status IS NULL THEN
      -- Newly created here: recorded like an admin approval in the app, with how many members were linked.
      INSERT INTO place_history (place_id, action, actor_person_id, detail)
      VALUES (v_place, 'approved', admin_id, jsonb_build_object('source', 'admin', 'via', 'ops_script_2026_11', 'linkedMembers', linked));
    ELSIF linked > 0 THEN
      INSERT INTO place_history (place_id, action, actor_person_id, detail)
      VALUES (v_place, 'alias_added', admin_id, jsonb_build_object('aliases', '[]'::jsonb, 'via', 'ops_script_2026_11', 'linkedMembers', linked));
    END IF;
    RAISE NOTICE '%: linked % member(s).', rec.city, linked;
  END LOOP;

  RAISE NOTICE 'Done. Linked % member(s) in total.', total;
END
$apply$;

-- Check afterwards (read-only): members now linked per city.
SELECT cp.city_label, cp.status, COUNT(p.id) AS linked_members
FROM canonical_places cp
LEFT JOIN people p ON p.residence_canonical_place_id = cp.id AND p.deleted_at IS NULL
WHERE lower(trim(cp.country)) = 'india'
  AND lower(cp.city_label) IN ('bengaluru', 'pune', 'gurugram', 'hyderabad', 'mumbai', 'varanasi', 'ahmedabad', 'kanpur')
GROUP BY cp.city_label, cp.status
ORDER BY linked_members DESC;


-- -----------------------------------------------------------------------------------------------------
-- UNDO — only if you need to reverse PART 2. Clears the links that point at these 8 cities, for members
-- whose link was made by this script's rules (typed one of the spellings, in India). The cities, their
-- spellings and the history stay (history can't be deleted), so you can redo it later from
-- Location cleanup. Typed text is untouched. Replace the email as in PART 2.
-- -----------------------------------------------------------------------------------------------------
-- DO $undo$
-- DECLARE
--   admin_email CONSTANT text := 'REPLACE_WITH_YOUR_ADMIN_EMAIL';
--   admin_id uuid;
--   cleared int;
-- BEGIN
--   SELECT id INTO admin_id FROM people
--   WHERE lower(institutional_email::text) = lower(btrim(admin_email)) AND role <> 'alumni' AND deleted_at IS NULL;
--   IF admin_id IS NULL THEN
--     RAISE EXCEPTION 'No admin account found for %.', admin_email;
--   END IF;
--   WITH targets AS (
--     SELECT id FROM canonical_places
--     WHERE lower(trim(country)) = 'india'
--       AND lower(city_label) IN ('bengaluru', 'pune', 'gurugram', 'hyderabad', 'mumbai', 'varanasi', 'ahmedabad', 'kanpur')
--   ), done AS (
--     UPDATE people p SET residence_canonical_place_id = NULL
--     WHERE p.residence_canonical_place_id IN (SELECT id FROM targets)
--       AND lower(regexp_replace(btrim(COALESCE(p.residence_city, '')), '\s+', ' ', 'g')) IN
--           ('bengaluru', 'bangalore', 'banglore', 'blr', 'pune', 'gurugram', 'gurgaon', 'hyderabad',
--            'mumbai', 'bombay', 'varanasi', 'ahmedabad', 'kanpur')
--       AND lower(regexp_replace(btrim(COALESCE(p.residence_country, '')), '\s+', ' ', 'g')) IN ('india', 'bharat')
--     RETURNING 1
--   )
--   SELECT COUNT(*) INTO cleared FROM done;
--   RAISE NOTICE 'Cleared % link(s). Cities, spellings and history are kept.', cleared;
-- END
-- $undo$;
