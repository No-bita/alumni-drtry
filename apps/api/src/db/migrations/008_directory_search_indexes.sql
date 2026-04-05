-- Directory search hardening (Phase 1): keyword match on organization names
-- uses EXISTS + to_tsvector(organization.name). Mirror people/occupations GIN pattern.

CREATE INDEX IF NOT EXISTS idx_organizations_fts_name
  ON organizations
  USING GIN (
    to_tsvector('simple'::regconfig, COALESCE(name::TEXT, ''))
  );
