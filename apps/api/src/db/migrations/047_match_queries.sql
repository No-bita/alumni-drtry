-- Ask → Match: privacy-safe query stats for tuning the matcher.
-- Deliberately stores NO person id, NO question text and NO entity values
-- (company/role/city names) — only the category, which field names were detected,
-- which parser ran, and how many matches came back.

CREATE TABLE IF NOT EXISTS match_queries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category text,
  detected_fields text[] NOT NULL DEFAULT '{}',
  parser_source text NOT NULL DEFAULT 'rules',
  result_count integer NOT NULL DEFAULT 0,
  had_overrides boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_queries_category_check CHECK (
    category IS NULL OR category IN (
      'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
    )
  ),
  CONSTRAINT match_queries_parser_source_check CHECK (parser_source IN ('rules', 'llm')),
  CONSTRAINT match_queries_result_count_check CHECK (result_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_match_queries_created_at ON match_queries (created_at DESC);
