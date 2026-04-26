-- Replace MBA with IDD in active degree options for onboarding.
UPDATE degrees
SET
  is_active = FALSE,
  updated_at = now()
WHERE code = 'mba';

INSERT INTO degrees (code, name, sort_order, is_active)
VALUES ('idd', 'IDD', 4, TRUE)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = now();
