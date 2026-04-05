-- Current residence (optional) for alumni directory and networking.

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS residence_country TEXT,
  ADD COLUMN IF NOT EXISTS residence_city TEXT;

COMMENT ON COLUMN people.residence_country IS 'Country of current residence (free text).';
COMMENT ON COLUMN people.residence_city IS 'City of current residence (free text).';

CREATE INDEX IF NOT EXISTS idx_people_residence_country_lower
  ON people (lower(trim(residence_country)))
  WHERE residence_country IS NOT NULL AND trim(residence_country) <> '';

CREATE INDEX IF NOT EXISTS idx_people_residence_city_lower
  ON people (lower(trim(residence_city)))
  WHERE residence_city IS NOT NULL AND trim(residence_city) <> '';
