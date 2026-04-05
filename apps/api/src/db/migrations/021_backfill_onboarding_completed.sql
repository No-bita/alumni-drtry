-- Users who already had directory minimum completion keep full-funnel semantics without redoing onboarding.

UPDATE people
SET onboarding_completed_at = COALESCE(onboarding_completed_at, profile_completed_at)
WHERE profile_completed_at IS NOT NULL;
