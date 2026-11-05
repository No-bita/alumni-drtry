-- Ask / Offer / Invitation: the author states what their Wall post is (approved 19:30).
-- Nullable on purpose: posts written before this field stay unmarked and untouched - no backfill,
-- no marking flow, no review flow. Structured posting flows that don't ask the question also stay unmarked.

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS kind TEXT;

ALTER TABLE intentcasts DROP CONSTRAINT IF EXISTS intentcasts_kind_check;
ALTER TABLE intentcasts ADD CONSTRAINT intentcasts_kind_check CHECK (
  kind IN ('ask', 'offer', 'invitation')
);
