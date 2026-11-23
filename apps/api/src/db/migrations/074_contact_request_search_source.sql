-- Reachouts can now be sent from a directory search result ("Reach out" on a search card).
-- They use the same note form as Ask, Careers and profiles, so they take the same categories.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp', 'careers', 'cities', 'profile', 'search')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    (
      source IN ('match', 'whatsapp', 'careers', 'profile', 'search')
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
