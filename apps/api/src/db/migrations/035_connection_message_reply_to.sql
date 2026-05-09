-- Inline replies within a thread: parent message referenced by FK (validated in app).

ALTER TABLE connection_messages
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID NULL
REFERENCES connection_messages(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connection_messages_reply_to
  ON connection_messages (reply_to_message_id)
WHERE reply_to_message_id IS NOT NULL;
