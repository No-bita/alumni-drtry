-- Phase 3 discovery performance indexes
-- 1) search filters
-- 2) keyword search
-- 3) search pagination order

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Speed up search ordering and active profile filtering.
-- COLLATE "C" makes lower() immutable for index support.
CREATE INDEX IF NOT EXISTS idx_people_search_order
  ON people ((lower(COALESCE(full_name, '')) COLLATE "C"), id)
  WHERE is_searchable = TRUE
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

-- Speed up optional department and batch filters.
CREATE INDEX IF NOT EXISTS idx_people_search_department_batch
  ON people (department_id, batch_year)
  WHERE is_searchable = TRUE
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

-- Full text search over people bio/skills/name.
-- Use || instead of concat_ws (concat_ws is STABLE; || is IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_people_fts_profile
  ON people
  USING GIN (
    to_tsvector('simple'::regconfig, COALESCE(full_name, '') || ' ' || COALESCE(bio, '') || ' ' || COALESCE(skills_text, ''))
  );

-- Full text search over occupation role/description.
CREATE INDEX IF NOT EXISTS idx_occupations_fts_role_desc
  ON occupations
  USING GIN (
    to_tsvector('simple'::regconfig, COALESCE(role_title, '') || ' ' || COALESCE(description, ''))
  );

-- Speed up occupation-based filters for search.
CREATE INDEX IF NOT EXISTS idx_occupations_person_org_type
  ON occupations (person_id, organization_id, occupation_type_id);
