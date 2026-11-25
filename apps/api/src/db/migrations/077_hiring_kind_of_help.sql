-- Ask recognises hiring (2026-11-25): "hiring" becomes a kind of help.
-- 1. Ask's query stats may record it.
-- 2. Notes may carry it: reachouts from Ask's candidate list (the new Hiring note) and private
--    hiring asks once connected. Every other allowed value is unchanged ('relocation' stays for
--    older rows, though Ask and the note form no longer produce it).

ALTER TABLE match_queries DROP CONSTRAINT IF EXISTS match_queries_category_check;
ALTER TABLE match_queries ADD CONSTRAINT match_queries_category_check CHECK (
  category IS NULL OR category IN (
    'referral', 'hiring', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
  )
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    (
      source IN ('match', 'whatsapp', 'careers', 'profile', 'search', 'wall', 'referral_request', 'hiring_request')
      AND source_category IN (
        'referral', 'hiring', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
      )
    )
    OR (
      source = 'cities'
      AND source_category IN ('coffee', 'relocation', 'visiting', 'newcomer')
    )
  )
);
