-- Canonicalize department codes to match app source-of-truth constants:
-- bme, bce, civil, cer, chem, cse, ece, eee, mech, meta, mst, min, pharma, apd, ic, ep, mnc, dse, hum
-- Keeps historical alias rows inactive after migrating references.

-- Ensure canonical department rows exist (idempotent).
INSERT INTO departments (code, name, is_active)
VALUES
  ('apd', 'Architecture, Planning and Design', TRUE),
  ('bce', 'Biochemical Engineering', TRUE),
  ('bme', 'Biomedical Engineering', TRUE),
  ('cer', 'Ceramic Engineering', TRUE),
  ('chem', 'Chemical Engineering', TRUE),
  ('civil', 'Civil Engineering', TRUE),
  ('cse', 'Computer Science and Engineering', TRUE),
  ('dse', 'Decision Science and Engineering', TRUE),
  ('ece', 'Electronics Engineering', TRUE),
  ('eee', 'Electrical Engineering', TRUE),
  ('ep', 'Engineering Physics', TRUE),
  ('hum', 'Humanities', TRUE),
  ('ic', 'Industrial Chemistry', TRUE),
  ('mech', 'Mechanical Engineering', TRUE),
  ('meta', 'Metallurgical Engineering', TRUE),
  ('min', 'Mining Engineering', TRUE),
  ('mnc', 'Mathematics and Computing', TRUE),
  ('mst', 'Material Sciences and Technology', TRUE),
  ('pharma', 'Pharmaceutical Engineering', TRUE)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE,
  updated_at = now();

-- Move existing people.department_id references from legacy alias codes to canonical codes.
WITH alias_to_canonical AS (
  SELECT *
  FROM (VALUES
    ('bt', 'bce'),
    ('ce', 'civil'),
    ('civ', 'civil'),
    ('cera', 'cer'),
    ('ch', 'chem'),
    ('me', 'mech'),
    ('mec', 'mech'),
    ('met', 'meta'),
    ('pharm', 'pharma')
  ) AS t(alias_code, canonical_code)
),
to_move AS (
  SELECT
    p.id AS person_id,
    d_old.code AS old_code,
    d_new.id AS new_department_id
  FROM people p
  JOIN departments d_old ON d_old.id = p.department_id
  JOIN alias_to_canonical m ON m.alias_code = d_old.code
  JOIN departments d_new ON d_new.code = m.canonical_code
)
UPDATE people p
SET department_id = tm.new_department_id,
    updated_at = now()
FROM to_move tm
WHERE p.id = tm.person_id;

-- Keep alias rows for audit/history, but mark inactive so selectors use canonical codes.
UPDATE departments
SET is_active = FALSE,
    updated_at = now()
WHERE code IN ('bt', 'ce', 'civ', 'cera', 'ch', 'me', 'mec', 'met', 'pharm');
