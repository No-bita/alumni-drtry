-- Ask → Match reach-out loop:
-- * source / source_category: which surface a note came from (only 'match' today) and the
--   question category, for the funnel. No question text is stored.
-- * reminder_sent_at: the one reminder email to a recipient who hasn't replied.
-- Duplicate pending notes to the same person are blocked in the service, not by a unique
-- index, because existing production data may already contain duplicates.

ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_category TEXT,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    source = 'match'
    AND source_category IN (
      'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
    )
  )
);

-- Reminder scan: pending notes without a reminder, by age.
CREATE INDEX IF NOT EXISTS idx_contact_requests_pending_reminder
  ON contact_requests (created_at)
  WHERE status = 'pending' AND reminder_sent_at IS NULL;

-- Reply stats per recipient over a time window.
CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient_created
  ON contact_requests (recipient_person_id, created_at DESC);
