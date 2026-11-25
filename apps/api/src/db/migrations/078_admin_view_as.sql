-- Admin "view as member" (testing only). An allowlisted admin (VIEW_AS_ADMIN_EMAILS) can open a member's
-- account read-only for a short time. The admin's own session is never swapped: a separate short-lived
-- token (its own cookie, stored hashed here) records who is looking and at whom.
--
-- admin_view_as_sessions: one row per view-as session (active until ended_at is set or expires_at passes).
-- admin_view_as_audit:    one row per start and per end, kept even if the session or a person is removed.

CREATE TABLE IF NOT EXISTS admin_view_as_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  admin_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  target_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_ip INET,
  created_user_agent TEXT,
  CONSTRAINT admin_view_as_sessions_not_self CHECK (admin_person_id <> target_person_id),
  CONSTRAINT admin_view_as_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_admin_view_as_sessions_admin
  ON admin_view_as_sessions (admin_person_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_view_as_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES admin_view_as_sessions(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN ('start', 'end')),
  admin_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  target_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_view_as_audit_created
  ON admin_view_as_audit (created_at DESC);

-- Same lock as 058_row_level_security: row security on, no policies (the API role owns the tables).
ALTER TABLE admin_view_as_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_view_as_audit ENABLE ROW LEVEL SECURITY;
