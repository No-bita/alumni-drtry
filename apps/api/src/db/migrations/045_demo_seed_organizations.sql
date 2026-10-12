-- Track organizations created by the demo tour seed independently of people rows.
-- This ensures seed ownership is preserved even if the demo people are deleted
-- while an organization is retained because another occupation still references it.

CREATE TABLE IF NOT EXISTS demo_seed_organizations (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE demo_seed_organizations IS 'Tracks organizations created by seed-demo-tour-fixtures for exact provenance and safe cleanup.';
