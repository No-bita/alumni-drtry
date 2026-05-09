ALTER TABLE connection_messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL;

ALTER TABLE connection_messages
DROP CONSTRAINT IF EXISTS connection_messages_edited_after_created_check;

ALTER TABLE connection_messages
ADD CONSTRAINT connection_messages_edited_after_created_check
CHECK (edited_at IS NULL OR edited_at >= created_at);
