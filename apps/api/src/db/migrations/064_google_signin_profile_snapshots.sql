-- Google sign-in profile: keep the latest full userinfo payload Google returned for each
-- member's most recent Google sign-in, stored separately from the editable/frozen Alma
-- Mater profile (people.*). One row per person; each successful Google sign-in replaces it.
-- Holds only the basic profile claims from the existing "openid email profile" scopes
-- (Google account id, email, verification status, name, picture, and anything else Google adds).
-- Never stores access tokens, ID tokens, authorization codes or secrets: the payload is the
-- userinfo response only, captured after the token exchange output is discarded.
--
-- Row-level security: enabled, no policies (same rule as 058/062/063: the API role owns
-- the table, every other role sees nothing). Stops if the migrating role can't own or bypass.

CREATE TABLE IF NOT EXISTS google_signin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL UNIQUE REFERENCES people (id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE google_signin_profiles ENABLE ROW LEVEL SECURITY;
