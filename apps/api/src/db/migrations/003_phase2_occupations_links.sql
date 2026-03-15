-- Phase 2 additional schema
-- 7) occupation table migration
-- 13) links table migration

CREATE TABLE IF NOT EXISTS occupations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  occupation_type_id UUID NOT NULL REFERENCES occupation_types(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role_title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT occupations_role_title_not_blank CHECK (length(trim(role_title)) > 0),
  CONSTRAINT occupations_date_range_check CHECK (
    start_date IS NULL OR end_date IS NULL OR start_date <= end_date
  ),
  CONSTRAINT occupations_current_end_date_check CHECK (
    (is_current = TRUE AND end_date IS NULL)
    OR (is_current = FALSE)
  )
);

CREATE INDEX IF NOT EXISTS idx_occupations_person_created_at
  ON occupations (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_occupations_person_current
  ON occupations (person_id, is_current);
CREATE INDEX IF NOT EXISTS idx_occupations_org
  ON occupations (organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_occupations_type
  ON occupations (occupation_type_id);

DROP TRIGGER IF EXISTS trg_occupations_updated_at ON occupations;
CREATE TRIGGER trg_occupations_updated_at
BEFORE UPDATE ON occupations
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS profile_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_links_platform_not_blank CHECK (length(trim(platform)) > 0),
  CONSTRAINT profile_links_url_not_blank CHECK (length(trim(url)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_links_person_platform_url
  ON profile_links (person_id, lower(platform), lower(url));
CREATE INDEX IF NOT EXISTS idx_profile_links_person_created_at
  ON profile_links (person_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_profile_links_updated_at ON profile_links;
CREATE TRIGGER trg_profile_links_updated_at
BEFORE UPDATE ON profile_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
