-- Cities v1 (Bengaluru first): arrivals, offers, city notes, Wall city tag, nudge email.
-- Coffee weekly limit lives in people.open_to_preferences (JSONB): no column needed.

-- 1. When someone moved city, and from where (set by profileService; not backfilled).
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS residence_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS residence_previous_place_id UUID REFERENCES canonical_places(id) ON DELETE SET NULL;

COMMENT ON COLUMN people.residence_changed_at IS
  'Last time residence_canonical_place_id changed from one place to a different place. NULL = never changed since v1.';
COMMENT ON COLUMN people.residence_previous_place_id IS
  'The place they lived in before residence_changed_at (feeds "from Pune" on an arrival).';

-- 2. Newcomer opt-in: "show me as new in town" for 30 days.
CREATE TABLE IF NOT EXISTS city_arrivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES canonical_places(id) ON DELETE CASCADE,
  previous_place_id UUID REFERENCES canonical_places(id) ON DELETE SET NULL,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visible_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  CONSTRAINT city_arrivals_ended_reason_check CHECK (
    (ended_at IS NULL AND ended_reason IS NULL)
    OR (ended_at IS NOT NULL AND ended_reason IN ('stopped', 'moved', 'expired'))
  ),
  CONSTRAINT city_arrivals_window_check CHECK (visible_until > opted_in_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_city_arrivals_one_active
  ON city_arrivals (person_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_city_arrivals_place_active
  ON city_arrivals (place_id, opted_in_at DESC) WHERE ended_at IS NULL;

-- 3. Offers from locals. An offer is not a message: nothing is sent to anyone but the newcomer.
CREATE TABLE IF NOT EXISTS city_help_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arrival_id UUID NOT NULL REFERENCES city_arrivals(id) ON DELETE CASCADE,
  offerer_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kinds TEXT[] NOT NULL,
  line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  CONSTRAINT city_help_offers_kinds_check CHECK (
    cardinality(kinds) >= 1
    AND kinds <@ ARRAY['areas', 'commute', 'coffee', 'intros']::TEXT[]
  ),
  CONSTRAINT city_help_offers_line_length CHECK (line IS NULL OR length(line) <= 160),
  CONSTRAINT uq_city_help_offers_one_per_local UNIQUE (arrival_id, offerer_person_id)
);

CREATE INDEX IF NOT EXISTS idx_city_help_offers_arrival
  ON city_help_offers (arrival_id, created_at DESC) WHERE withdrawn_at IS NULL;

-- 4. Notes from the Cities page.
ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS city_help_offer_id UUID REFERENCES city_help_offers(id) ON DELETE SET NULL;

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp', 'careers', 'cities')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    (
      source IN ('match', 'whatsapp', 'careers')
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

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_newcomer_offer_check;
-- Only newcomer notes link to an offer. The service requires the link on create;
-- the column may later go NULL if the offer row is deleted.
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_newcomer_offer_check CHECK (
  city_help_offer_id IS NULL OR source_category = 'newcomer'
);

-- Weekly coffee-limit count: asks to a recipient this week.
CREATE INDEX IF NOT EXISTS idx_contact_requests_city_coffee
  ON contact_requests (recipient_person_id, created_at DESC)
  WHERE source = 'cities' AND source_category = 'coffee';

-- Pending city-help asks per sender (limit 3).
CREATE INDEX IF NOT EXISTS idx_contact_requests_city_help_pending
  ON contact_requests (sender_person_id)
  WHERE source = 'cities' AND source_category IN ('relocation', 'visiting') AND status = 'pending';

-- 5. Search log: a city viewed by a non-local counts as demand, marked 'cities'.
ALTER TABLE match_queries DROP CONSTRAINT IF EXISTS match_queries_parser_source_check;
ALTER TABLE match_queries ADD CONSTRAINT match_queries_parser_source_check CHECK (
  parser_source IN ('rules', 'llm', 'careers', 'cities')
);

-- Once per viewer, city and day: a keyed hash (no person id) so the demand log stays person-free.
CREATE TABLE IF NOT EXISTS city_demand_view_keys (
  key_hash TEXT PRIMARY KEY,
  viewed_on DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_city_demand_view_keys_day ON city_demand_view_keys (viewed_on);

-- 6. Wall posts can carry a city.
ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES canonical_places(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intentcasts_place_feed
  ON intentcasts (place_id, status, created_at DESC) WHERE place_id IS NOT NULL;

-- 7. Nudge email: last send per person, and their frequency choice.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS city_nudge_frequency TEXT NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS city_nudge_last_sent_at TIMESTAMPTZ;

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_city_nudge_frequency_check;
ALTER TABLE people ADD CONSTRAINT people_city_nudge_frequency_check CHECK (
  city_nudge_frequency IN ('weekly', 'monthly', 'never')
);
