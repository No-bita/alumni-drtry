-- Phase 2 foundations
-- 1) controlled vocab tables + seed
-- 2) organizations table + seed
-- 3) admin role on people
-- 4) extend people table for profile data

-- Shared updated_at trigger for mutable tables.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Controlled vocab: departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT departments_name_not_blank CHECK (length(trim(name)) > 0)
);

-- Controlled vocab: degrees
CREATE TABLE IF NOT EXISTS degrees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT degrees_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT degrees_name_not_blank CHECK (length(trim(name)) > 0)
);

-- Controlled vocab: occupation types
CREATE TABLE IF NOT EXISTS occupation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT occupation_types_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT occupation_types_name_not_blank CHECK (length(trim(name)) > 0)
);

-- Organizations with status to support suggestion + admin approval queue.
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT NOT NULL UNIQUE,
  approval_status TEXT NOT NULL DEFAULT 'approved',
  canonical_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  reviewed_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_not_blank CHECK (length(trim(name::TEXT)) > 0),
  CONSTRAINT organizations_status_check CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT organizations_self_canonical_check CHECK (
    canonical_organization_id IS NULL OR canonical_organization_id <> id
  ),
  CONSTRAINT organizations_review_state_check CHECK (
    (approval_status = 'pending' AND reviewed_by_person_id IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
    OR (approval_status = 'approved' AND rejection_reason IS NULL)
    OR (approval_status = 'rejected' AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_organizations_status_created_at
  ON organizations (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizations_canonical
  ON organizations (canonical_organization_id)
  WHERE canonical_organization_id IS NOT NULL;

-- Admin role and phase-2 profile fields on people.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'alumni',
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS degree_id UUID REFERENCES degrees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_year SMALLINT,
  ADD COLUMN IF NOT EXISTS personal_email CITEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS skills_text TEXT,
  ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'people_role_check'
      AND conrelid = 'people'::regclass
  ) THEN
    ALTER TABLE people
      ADD CONSTRAINT people_role_check
      CHECK (role IN ('alumni', 'admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'people_batch_year_check'
      AND conrelid = 'people'::regclass
  ) THEN
    ALTER TABLE people
      ADD CONSTRAINT people_batch_year_check
      CHECK (batch_year IS NULL OR batch_year BETWEEN 1960 AND (EXTRACT(YEAR FROM now())::INT + 1));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_personal_email
  ON people (personal_email)
  WHERE personal_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_department_id
  ON people (department_id);
CREATE INDEX IF NOT EXISTS idx_people_degree_id
  ON people (degree_id);
CREATE INDEX IF NOT EXISTS idx_people_batch_year
  ON people (batch_year);
CREATE INDEX IF NOT EXISTS idx_people_is_searchable_true
  ON people (is_searchable)
  WHERE is_searchable = TRUE;

-- Triggers for updated_at maintenance.
DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_degrees_updated_at ON degrees;
CREATE TRIGGER trg_degrees_updated_at
BEFORE UPDATE ON degrees
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_occupation_types_updated_at ON occupation_types;
CREATE TRIGGER trg_occupation_types_updated_at
BEFORE UPDATE ON occupation_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_people_updated_at ON people;
CREATE TRIGGER trg_people_updated_at
BEFORE UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- Seed departments (from known parser-friendly IIT BHU department codes).
INSERT INTO departments (code, name)
VALUES
  ('bme', 'Biomedical Engineering'),
  ('bt', 'Biochemical Engineering'),
  ('ce', 'Civil Engineering'),
  ('cer', 'Ceramic Engineering'),
  ('ch', 'Chemical Engineering'),
  ('chem', 'Chemical Engineering'),
  ('civil', 'Civil Engineering'),
  ('cse', 'Computer Science and Engineering'),
  ('ece', 'Electronics Engineering'),
  ('eee', 'Electrical Engineering'),
  ('me', 'Mechanical Engineering'),
  ('mec', 'Mechanical Engineering'),
  ('met', 'Metallurgical Engineering'),
  ('meta', 'Metallurgical Engineering'),
  ('min', 'Mining Engineering'),
  ('pharm', 'Pharmaceutical Engineering')
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE,
  updated_at = now();

-- Seed degrees.
INSERT INTO degrees (code, name, sort_order)
VALUES
  ('btech', 'BTech', 1),
  ('mtech', 'MTech', 2),
  ('phd', 'PhD', 3),
  ('mba', 'MBA', 4),
  ('msc', 'MSc', 5),
  ('other', 'Other', 999)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = now();

-- Seed occupation types.
INSERT INTO occupation_types (code, name, sort_order)
VALUES
  ('full_time_employment', 'Full time employment', 1),
  ('part_time_employment', 'Part time employment', 2),
  ('freelance_consulting', 'Freelance / Consulting', 3),
  ('phd_research', 'PhD / Research', 4),
  ('postdoctoral_research', 'Postdoctoral research', 5),
  ('founded_venture', 'Founded a venture', 6),
  ('civil_services_government', 'Civil services / Government', 7),
  ('military', 'Military', 8),
  ('higher_education_non_research', 'Higher education (non-research)', 9),
  ('sabbatical_career_break', 'Sabbatical / Career break', 10),
  ('other', 'Other', 999)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = now();

-- Seed organizations.
INSERT INTO organizations (name, approval_status)
VALUES
  ('Indian Institute of Technology (BHU), Varanasi', 'approved'),
  ('Banaras Hindu University', 'approved')
ON CONFLICT (name)
DO UPDATE SET
  approval_status = 'approved',
  updated_at = now();

-- Keep existing users aligned with new columns.
UPDATE people p
SET batch_year = p.joining_year
WHERE p.batch_year IS NULL
  AND p.joining_year IS NOT NULL;

UPDATE people p
SET department_id = d.id
FROM departments d
WHERE p.department_id IS NULL
  AND p.department_code IS NOT NULL
  AND lower(p.department_code) = d.code;
