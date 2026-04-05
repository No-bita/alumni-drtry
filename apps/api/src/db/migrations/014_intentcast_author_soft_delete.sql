-- Author "delete" hides post from others; row is hard-deleted after author_delete_purge_at.

ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS author_soft_deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS author_delete_purge_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_intentcasts_author_delete_purge
  ON intentcasts (author_delete_purge_at)
  WHERE author_delete_purge_at IS NOT NULL;
