-- Successful OTP/magic-link verifies increment this; onboarding eligibility uses first N logins (see web onboardingEligibility).

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS app_login_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN people.app_login_count IS 'Count of successful auth verifies; used to cap onboarding funnel eligibility.';
