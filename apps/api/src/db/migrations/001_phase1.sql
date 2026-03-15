CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutional_email CITEXT NOT NULL UNIQUE,
  department_code TEXT,
  department_name TEXT,
  joining_year SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT people_joining_year_check
    CHECK (joining_year IS NULL OR joining_year BETWEEN 1960 AND (EXTRACT(YEAR FROM now())::INT + 1))
);

CREATE INDEX IF NOT EXISTS idx_people_joining_year ON people (joining_year);
CREATE INDEX IF NOT EXISTS idx_people_department_code ON people (department_code);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutional_email CITEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,
  magic_link_hash TEXT NOT NULL,
  magic_link_expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  created_ip INET,
  created_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_challenges_attempts_check CHECK (attempts >= 0),
  CONSTRAINT auth_challenges_max_attempts_check CHECK (max_attempts >= 1)
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_email_created_at
  ON auth_challenges (institutional_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_ip_created_at
  ON auth_challenges (created_ip, created_at DESC)
  WHERE created_ip IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_ip INET,
  created_user_agent TEXT,
  rotated_from UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_person_id ON sessions (person_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (session_hash, expires_at)
  WHERE revoked_at IS NULL;
