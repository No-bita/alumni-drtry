-- Full onboarding (all steps) — distinct from minimum directory eligibility (profile_completed_at).

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN people.onboarding_completed_at IS 'Set when the alumni finishes the full onboarding funnel (contact & links step).';
