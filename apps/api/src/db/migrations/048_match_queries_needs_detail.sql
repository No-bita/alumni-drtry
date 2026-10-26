-- Ask → Match funnel: separate "nothing to search on yet" (needs detail) from "searched, no match".
ALTER TABLE match_queries
  ADD COLUMN IF NOT EXISTS needs_detail BOOLEAN NOT NULL DEFAULT FALSE;
