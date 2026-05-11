-- Canonical residence places + aliases for directory aggregates and search (Phase 1).

CREATE TABLE canonical_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  city_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canonical_places_country_city_nonempty CHECK (
    trim(country) <> '' AND trim(city_label) <> ''
  )
);

CREATE UNIQUE INDEX idx_canonical_places_country_city_unique
  ON canonical_places (lower(trim(country)), lower(trim(city_label)));

COMMENT ON TABLE canonical_places IS 'Canonical (country, city) for alumni residence; people.residence_canonical_place_id references one row.';
COMMENT ON COLUMN canonical_places.city_label IS 'Display label for the city (e.g. Bengaluru).';

CREATE TABLE place_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_place_id UUID NOT NULL REFERENCES canonical_places (id) ON DELETE CASCADE,
  alias_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT place_aliases_normalized_nonempty CHECK (trim(alias_normalized) <> '')
);

CREATE UNIQUE INDEX idx_place_aliases_canonical_normalized
  ON place_aliases (canonical_place_id, alias_normalized);

CREATE INDEX idx_place_aliases_normalized_lookup ON place_aliases (alias_normalized);

COMMENT ON TABLE place_aliases IS 'Alternate spellings / typos mapped to a canonical_place_id (normalized lowercase trim).';

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS residence_canonical_place_id UUID REFERENCES canonical_places (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_people_residence_canonical_place
  ON people (residence_canonical_place_id)
  WHERE residence_canonical_place_id IS NOT NULL;

COMMENT ON COLUMN people.residence_canonical_place_id IS 'Optional FK to canonical_places; residence_city/country remain denormalized display copies.';
