-- Areas of experience: short labels a member adds to their profile ("Pricing", "D2C growth").
-- One row per area. The app normalises spacing before saving; label_key is derived here so
-- "Pricing" and "pricing" can never both exist for one person, whatever writes the row.
-- Positions 0-7 plus a unique (person, position) cap a member at 8 areas in the schema itself.
CREATE TABLE person_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (
    char_length(label) BETWEEN 1 AND 40
    AND label = btrim(label)
    AND label !~ '\s{2,}'
  ),
  label_key TEXT GENERATED ALWAYS AS (lower(label)) STORED,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT person_areas_person_label_key UNIQUE (person_id, label_key),
  CONSTRAINT person_areas_person_position_key UNIQUE (person_id, position)
);

-- Counting how many members list an area, and Ask's lookups by area.
CREATE INDEX person_areas_label_key_idx ON person_areas (label_key);
-- Suggestions while typing match any word in an area (pg_trgm is enabled in 004).
CREATE INDEX person_areas_label_key_trgm_idx ON person_areas USING gin (label_key gin_trgm_ops);

-- API-owned table only, matching the existing private-table RLS convention.
ALTER TABLE person_areas ENABLE ROW LEVEL SECURITY;
