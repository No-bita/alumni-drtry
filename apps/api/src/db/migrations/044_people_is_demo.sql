-- Add is_demo column to explicitly flag shared demo account(s).
-- This replaces fragile runtime email comparisons with an authoritative stored account flag.

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN people.is_demo IS 'Server-owned flag indicating this account is a dedicated shared demo account.';

CREATE INDEX IF NOT EXISTS idx_people_is_demo
  ON people (is_demo)
  WHERE is_demo = TRUE;
