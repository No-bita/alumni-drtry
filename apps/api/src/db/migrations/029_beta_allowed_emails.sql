CREATE TABLE IF NOT EXISTS beta_allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  notes TEXT,
  added_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_allowed_emails_status_idx
  ON beta_allowed_emails (status);

CREATE OR REPLACE FUNCTION set_beta_allowed_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_beta_allowed_emails_updated_at ON beta_allowed_emails;
CREATE TRIGGER trg_beta_allowed_emails_updated_at
BEFORE UPDATE ON beta_allowed_emails
FOR EACH ROW
EXECUTE FUNCTION set_beta_allowed_emails_updated_at();
