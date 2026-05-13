-- Allow graduation batch_year up to current calendar year + 5 (aligned with API Zod).

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_batch_year_check;

ALTER TABLE people
  ADD CONSTRAINT people_batch_year_check
  CHECK (batch_year IS NULL OR batch_year BETWEEN 1960 AND (EXTRACT(YEAR FROM now())::INT + 5));
