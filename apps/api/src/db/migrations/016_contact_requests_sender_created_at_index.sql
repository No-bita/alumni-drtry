-- Speed up abuse-limit COUNT for outgoing contact requests by sender + time window.
CREATE INDEX IF NOT EXISTS idx_contact_requests_sender_created_at
  ON contact_requests (sender_person_id, created_at DESC);
