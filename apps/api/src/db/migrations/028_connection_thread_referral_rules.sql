-- Referral chat rules and retention support.

ALTER TABLE connection_threads
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general';

ALTER TABLE connection_threads
  DROP CONSTRAINT IF EXISTS connection_threads_kind_check;

ALTER TABLE connection_threads
  ADD CONSTRAINT connection_threads_kind_check
  CHECK (kind IN ('general', 'referral'));

CREATE INDEX IF NOT EXISTS idx_connection_threads_kind_updated
  ON connection_threads (kind, updated_at DESC);
