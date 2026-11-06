-- Anti-scraping: directory/profile "discovery reads" counted per member in the database, so the limits
-- hold across restarts and across several API instances (the old counter lived in process memory).
--   bucket 'day'    = calendar day in Asia/Kolkata (window_start is that day's 00:00 IST)
--   bucket 'minute' = the current UTC minute (burst limit)
-- One upsert per counted request. Old rows are pruned by the app (minute rows after an hour,
-- day rows after 35 days). Admins are not counted.
CREATE TABLE IF NOT EXISTS discovery_read_counters (
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, bucket, window_start),
  CONSTRAINT discovery_read_counters_bucket_check CHECK (bucket IN ('day', 'minute')),
  CONSTRAINT discovery_read_counters_count_check CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_discovery_read_counters_bucket_window
  ON discovery_read_counters (bucket, window_start);
