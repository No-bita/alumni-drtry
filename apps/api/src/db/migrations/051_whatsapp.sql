-- WhatsApp pilot: the bot is an entry point; the website stays the system of record.

-- One row per WhatsApp number that has talked to us. Linked to a member once they sign in on the web.
-- A linked number never moves to another member, and a member keeps their first number (an admin can unlink by hand).
CREATE TABLE IF NOT EXISTS wa_contacts (
  wa_id TEXT PRIMARY KEY CHECK (wa_id ~ '^[0-9]{8,15}$'),
  person_id UUID UNIQUE REFERENCES people(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ,
  -- Last message they sent us: replies are free (service tier) only within 24 hours of it.
  last_inbound_at TIMESTAMPTZ,
  -- Alumni choose to get referral notes here (off by default).
  notes_opted_in_at TIMESTAMPTZ,
  notes_paused_at TIMESTAMPTZ,
  -- "stop": no WhatsApp messages from us at all until "start".
  stopped_at TIMESTAMPTZ,
  -- Small conversation state, e.g. {"step":"awaiting_referral"}.
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Website links from the bot work once: the token's nonce is recorded when it links a number.
CREATE TABLE IF NOT EXISTS wa_link_tokens_used (
  nonce TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_link_tokens_used_at ON wa_link_tokens_used (used_at);

-- Every message in and out, for idempotency, delivery status and spend. Never the message text.
CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  wa_id TEXT NOT NULL,
  -- text | interactive | template | button | other
  kind TEXT NOT NULL,
  template TEXT,
  -- What Meta billed it as (from status webhooks): service | utility | marketing | authentication
  pricing_category TEXT,
  billable BOOLEAN,
  -- accepted (Meta took it) | sent | delivered | read | failed | uncertain (no answer from Meta in time)
  status TEXT NOT NULL DEFAULT 'accepted',
  error_code TEXT,
  contact_request_id UUID REFERENCES contact_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_time ON wa_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_template_month ON wa_messages (created_at) WHERE kind = 'template';

-- Notes: how the alum was told (email or WhatsApp), to compare reply rates.
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS delivery_channel TEXT
  CHECK (delivery_channel IS NULL OR delivery_channel IN ('email', 'whatsapp'));

-- Onboarding test: members who arrived through the WhatsApp entry link (null = website).
ALTER TABLE people ADD COLUMN IF NOT EXISTS signup_channel TEXT
  CHECK (signup_channel IS NULL OR signup_channel IN ('whatsapp'));

-- Notes sent from the bot's "Send note" link (the note itself is written on the website).
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_check CHECK (
  source IS NULL OR source IN ('match', 'whatsapp')
);

ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_source_category_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_source_category_check CHECK (
  source_category IS NULL OR (
    source IN ('match', 'whatsapp')
    AND source_category IN (
      'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'
    )
  )
);
