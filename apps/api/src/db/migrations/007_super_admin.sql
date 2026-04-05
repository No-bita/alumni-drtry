-- Super admin role + seed account (elevated access; use only for trusted operators).

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_role_check;
ALTER TABLE people
  ADD CONSTRAINT people_role_check
  CHECK (role IN ('alumni', 'admin', 'super_admin'));

INSERT INTO people (institutional_email, role)
VALUES ('seed-admin-placeholder@example.invalid', 'super_admin')
ON CONFLICT (institutional_email)
DO UPDATE SET
  role = 'super_admin',
  updated_at = now();
