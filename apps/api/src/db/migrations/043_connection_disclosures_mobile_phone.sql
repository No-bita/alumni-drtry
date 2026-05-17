-- Allow sharing mobile number via explicit chat disclosure (not on public profile).
ALTER TABLE connection_disclosures
  DROP CONSTRAINT IF EXISTS connection_disclosures_kind_check;

ALTER TABLE connection_disclosures
  ADD CONSTRAINT connection_disclosures_kind_check CHECK (
    kind IN ('institutional_email', 'personal_email', 'mobile_phone', 'profile_link')
  );
