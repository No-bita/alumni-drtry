-- SECURITY: Beta/admin allowlist emails are sensitive PII. Never insert real cohort addresses here.
-- Populate production via `/v1/admin/beta/allowed-emails` (admin-authenticated) or a one-off script
-- against DATABASE_URL — never commit bulk invite lists to version control.
--
-- Earlier revisions of this migration contained real addresses and were removed from the repository record.
-- Already-applied databases keep their existing rows; fresh installs rely on admin UI or ops scripts.

SELECT 1;
