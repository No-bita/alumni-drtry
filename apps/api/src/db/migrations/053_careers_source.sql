-- Careers page: notes sent from its company screen, and company lookups counted as demand.

-- Notes: 'careers' joins 'match' and 'whatsapp' as a place a note can come from.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp', 'careers')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    source IN ('match', 'whatsapp', 'careers')
    AND source_category IN (
      'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
    )
  )
);

-- Search log: a company looked up on Careers is logged like a referral question, marked 'careers'.
ALTER TABLE match_queries DROP CONSTRAINT IF EXISTS match_queries_parser_source_check;
ALTER TABLE match_queries ADD CONSTRAINT match_queries_parser_source_check CHECK (
  parser_source IN ('rules', 'llm', 'careers')
);
