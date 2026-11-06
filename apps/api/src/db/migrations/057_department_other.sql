-- Add a generic "Other" department so members whose program is not in the canonical
-- (BHU-derived) list - e.g. newly allowed institutes - can save a valid value instead of
-- being stuck on an unrecognized email-parsed guess.
INSERT INTO departments (code, name, is_active)
VALUES ('other', 'Other', TRUE)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE,
  updated_at = now();
