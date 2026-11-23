-- Reachouts can now be sent from a member's profile ("Reach out" in the profile header).
-- They use the same note form as Ask and Careers, so they take the same categories.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp', 'careers', 'cities', 'profile')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    (
      source IN ('match', 'whatsapp', 'careers', 'profile')
      AND source_category IN (
        'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
      )
    )
    OR (
      source = 'cities'
      AND source_category IN ('coffee', 'relocation', 'visiting', 'newcomer')
    )
  )
);
