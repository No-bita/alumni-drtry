-- Note form: what the sender asked for, as fields (purpose referral or advice).
-- The readable message is still stored in `message` (built from these), so email, WhatsApp,
-- reminders and Notifications keep working. Older notes have no details.
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS details JSONB;

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_details_purpose_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_details_purpose_check CHECK (
  details IS NULL OR details ->> 'purpose' IN ('referral', 'advice')
);
