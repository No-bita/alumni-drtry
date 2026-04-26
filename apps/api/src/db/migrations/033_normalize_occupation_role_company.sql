-- Normalize legacy occupation role_title strings that embed company names.
-- New model stores:
-- - role in occupations.role_title
-- - company via occupations.organization_id -> organizations.name
-- - optional industry/detail in occupations.description

-- 1) Ensure organizations exist for company names embedded in role_title.
INSERT INTO organizations (name, approval_status, created_by_person_id)
SELECT DISTINCT parsed_company_name, 'approved', NULL::uuid
FROM (
  SELECT
    CASE
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$', 'i'))[2])
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)$', 'i'))[2])
      WHEN position('·' in o.role_title) > 0
        THEN btrim(split_part(o.role_title, '·', 2))
      ELSE NULL
    END AS parsed_company_name
  FROM occupations o
  WHERE o.organization_id IS NULL
    AND o.role_title IS NOT NULL
    AND btrim(o.role_title) <> ''
) extracted
LEFT JOIN organizations existing
  ON lower(btrim(existing.name::text)) = lower(btrim(extracted.parsed_company_name))
WHERE extracted.parsed_company_name IS NOT NULL
  AND extracted.parsed_company_name <> ''
  AND existing.id IS NULL;

-- 2) Rewrite occupations to split role/company and attach organization_id.
WITH parsed AS (
  SELECT
    o.id AS occupation_id,
    CASE
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$', 'i'))[1])
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)$', 'i'))[1])
      WHEN position('·' in o.role_title) > 0
        THEN btrim(split_part(o.role_title, '·', 1))
      ELSE NULL
    END AS parsed_role_title,
    CASE
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$', 'i'))[2])
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)$', 'i'))[2])
      WHEN position('·' in o.role_title) > 0
        THEN btrim(split_part(o.role_title, '·', 2))
      ELSE NULL
    END AS parsed_company_name,
    CASE
      WHEN o.role_title ~* '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$'
        THEN btrim((regexp_match(o.role_title, '^(.+)\\s@\\s(.+)\\s\\(Industry:\\s(.+)\\)$', 'i'))[3])
      ELSE NULL
    END AS parsed_industry
  FROM occupations o
  WHERE o.organization_id IS NULL
    AND o.role_title IS NOT NULL
    AND btrim(o.role_title) <> ''
)
UPDATE occupations o
SET role_title = COALESCE(NULLIF(parsed.parsed_role_title, ''), o.role_title),
    organization_id = org.id,
    description = COALESCE(
      o.description,
      CASE
        WHEN parsed.parsed_industry IS NOT NULL AND parsed.parsed_industry <> ''
          THEN 'Industry: ' || parsed.parsed_industry
        ELSE NULL
      END
    )
FROM parsed
JOIN organizations org
  ON lower(btrim(org.name::text)) = lower(btrim(parsed.parsed_company_name))
WHERE o.id = parsed.occupation_id
  AND parsed.parsed_company_name IS NOT NULL
  AND parsed.parsed_company_name <> '';
