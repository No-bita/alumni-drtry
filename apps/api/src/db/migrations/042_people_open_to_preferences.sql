ALTER TABLE people
  ADD COLUMN IF NOT EXISTS open_to_preferences JSONB;

COMMENT ON COLUMN people.open_to_preferences IS
  'Alumni “Open to” card preferences: { referrals, coffee, mentorship } → { enabled, description }.';
