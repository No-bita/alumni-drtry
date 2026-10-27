-- Sign-in: when a newer code is emailed, older open codes for that email are retired.
-- superseded_at marks them so verify can say "use the latest email" instead of "invalid".
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
