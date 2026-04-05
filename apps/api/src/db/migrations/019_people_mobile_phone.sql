-- Optional mobile number for alumni contact (onboarding + profile).

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS mobile_phone TEXT;

COMMENT ON COLUMN people.mobile_phone IS 'Optional mobile number as entered by the user (international or local format).';
