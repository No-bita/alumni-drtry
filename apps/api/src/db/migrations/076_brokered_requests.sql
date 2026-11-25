-- Brokered requests (approved): instead of a member picking someone and waiting, they tell us what
-- they need and the platform asks every eligible alum on their behalf. The first alum to say yes is
-- connected (an accepted reachout); everyone else asked is told it's taken care of.
-- This build: referrals (always brokered) and hiring (optional, from a hiring post).

-- 1. A member's job function: one tap on the profile, used to reach the right people for hiring.
ALTER TABLE people ADD COLUMN IF NOT EXISTS job_function TEXT;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_job_function_check;
ALTER TABLE people ADD CONSTRAINT people_job_function_check CHECK (
  job_function IS NULL OR job_function IN ('tech', 'product', 'design', 'data', 'sales', 'marketing', 'ops', 'finance', 'other')
);
CREATE INDEX IF NOT EXISTS idx_people_job_function ON people (job_function) WHERE job_function IS NOT NULL;

-- 2. Hiring posts keep their answers as fields (the card header is built from them; no heading).
ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS hiring_function TEXT,
  ADD COLUMN IF NOT EXISTS hiring_role_title TEXT,
  ADD COLUMN IF NOT EXISTS hiring_experience TEXT,
  ADD COLUMN IF NOT EXISTS hiring_location TEXT,
  ADD COLUMN IF NOT EXISTS hiring_company TEXT,
  ADD COLUMN IF NOT EXISTS hiring_respond_via TEXT,
  ADD COLUMN IF NOT EXISTS hiring_apply_url TEXT;
ALTER TABLE intentcasts DROP CONSTRAINT IF EXISTS intentcasts_hiring_fields_check;
ALTER TABLE intentcasts ADD CONSTRAINT intentcasts_hiring_fields_check CHECK (
  -- Either no structured hiring fields (older posts, other categories) ...
  (
    hiring_function IS NULL AND hiring_role_title IS NULL AND hiring_experience IS NULL AND hiring_location IS NULL
    AND hiring_company IS NULL AND hiring_respond_via IS NULL AND hiring_apply_url IS NULL
  )
  -- ... or a complete hiring post: function, experience and how to respond are required.
  OR (
    category = 'hiring'
    AND hiring_function IN ('tech', 'product', 'design', 'data', 'sales', 'marketing', 'ops', 'finance', 'other')
    AND hiring_experience IN ('intern', '0_3', '3_7', '7_plus')
    AND hiring_respond_via IN ('reachout', 'link')
    AND (hiring_respond_via = 'reachout' OR hiring_apply_url IS NOT NULL)
  )
);

-- 3. The requests and the asks sent for them.
CREATE TABLE IF NOT EXISTS broker_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('referral', 'hiring')),
  asker_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- Hiring: the post the request was made from.
  intentcast_id UUID REFERENCES intentcasts(id) ON DELETE SET NULL,
  company TEXT NOT NULL CHECK (length(trim(company)) > 0),
  job_function TEXT NOT NULL CHECK (job_function IN ('tech', 'product', 'design', 'data', 'sales', 'marketing', 'ops', 'finance', 'other')),
  experience_band TEXT CHECK (experience_band IN ('intern', '0_3', '3_7', '7_plus')),
  role_title TEXT,
  job_url TEXT,
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  -- Referral: the note form fields (same rules as a referral reachout).
  details JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'connected', 'expired')),
  asked_count INT NOT NULL DEFAULT 0 CHECK (asked_count >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  -- The accepted reachout that connects the asker and the helper.
  contact_request_id UUID REFERENCES contact_requests(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT broker_requests_state_check CHECK (
    (status = 'open' AND connected_at IS NULL AND expired_at IS NULL)
    OR (status = 'connected' AND connected_at IS NOT NULL AND expired_at IS NULL)
    OR (status = 'expired' AND expired_at IS NOT NULL AND connected_at IS NULL)
  ),
  CONSTRAINT broker_requests_hiring_post_check CHECK (kind <> 'hiring' OR experience_band IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_broker_requests_asker ON broker_requests (asker_person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_requests_open_expiry ON broker_requests (expires_at) WHERE status = 'open';
-- One hiring request per post.
CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_requests_intentcast ON broker_requests (intentcast_id) WHERE intentcast_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS broker_asks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES broker_requests(id) ON DELETE CASCADE,
  helper_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'accepted', 'declined', 'withdrawn')),
  -- 'whatsapp' when the ask went out on WhatsApp (behind the admin switch).
  delivery_channel TEXT CHECK (delivery_channel IN ('whatsapp')),
  seen_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT broker_asks_one_per_helper UNIQUE (request_id, helper_person_id),
  CONSTRAINT broker_asks_state_check CHECK ((status = 'asked') = (responded_at IS NULL))
);
-- First yes wins, guaranteed by the database: at most one accepted ask per request.
CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_asks_one_accepted ON broker_asks (request_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_broker_asks_helper ON broker_asks (helper_person_id, status, created_at DESC);

-- 4. A brokered connection is an accepted reachout with its own source. Hiring posts can also be
--    answered with a direct reachout from the Wall.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp', 'careers', 'cities', 'profile', 'search', 'wall', 'referral_request', 'hiring_request')
);
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    (
      source IN ('match', 'whatsapp', 'careers', 'profile', 'search', 'wall', 'referral_request')
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

-- 5. Admin switches. broker_whatsapp: also send brokered asks on WhatsApp (off until an admin turns it on).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES people(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Row-level security on the new tables (the app connects as the owner, so it is unaffected).
ALTER TABLE broker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_asks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
