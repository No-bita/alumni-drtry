-- Seed requested admin email and ensure it has admin access.
-- Also keep it in the admin allowlist so future logins stay auto-promoted.

INSERT INTO people (institutional_email, role)
VALUES ('seed-admin-placeholder@example.invalid', 'admin')
ON CONFLICT (institutional_email)
DO UPDATE SET
  role = CASE
    WHEN people.role = 'super_admin' THEN people.role
    ELSE 'admin'
  END,
  updated_at = now();

INSERT INTO admin_allowed_emails (email_normalized, status, notes)
VALUES (
  'seed-admin-placeholder@example.invalid',
  'active',
  'Seeded by migration: requested admin allowlist entry.'
)
ON CONFLICT (email_normalized)
DO UPDATE SET
  status = 'active',
  updated_at = now();
