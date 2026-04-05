-- Add Material Sciences and Technology (email local-part code mst). User may refresh copy later.
INSERT INTO departments (code, name)
VALUES ('mst', 'Material Sciences and Technology')
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE,
  updated_at = now();
