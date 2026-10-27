-- Short links from the WhatsApp bot: /w/<code> instead of a long signed link written out in full.
-- The signed link (which says which number it was sent to) and where to go next stay on our side;
-- the chat only shows the code. Same 24-hour life as the signed link.
CREATE TABLE IF NOT EXISTS wa_short_links (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9]{8}$'),
  token TEXT NOT NULL,
  next TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wa_short_links_expires ON wa_short_links (expires_at);
