-- Admin announcements: an admin sends a title + plain-text message (+ optional in-app link) to members
-- filtered by batch, department and city, in-app (Notifications panel), by email, or both.
--
-- * announcements: one row per send (tests included, flagged is_test), the full history log.
-- * announcement_recipients: the audience snapshot taken at send time (who gets the in-app item).
-- * announcement_email_deliveries: one row per email address (personal and institutional, de-duplicated),
--   claimed and marked by the in-process sending worker so nothing is sent twice.
-- * people.announcement_emails_opt_out: the unsubscribe link in announcement emails sets this.
--   Opted-out members still get the in-app item.
--
-- Row-level security: enabled on the new tables, no policies (same rule as 058/062: the API role owns
-- the tables, every other role sees nothing). Stops if the migrating role can't own or bypass.

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_path TEXT,
  channels TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'sending',
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_person_id UUID REFERENCES people (id) ON DELETE SET NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT announcements_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT announcements_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  CONSTRAINT announcements_link_path_shape CHECK (
    link_path IS NULL OR (link_path LIKE '/%' AND link_path NOT LIKE '//%' AND char_length(link_path) <= 300)
  ),
  CONSTRAINT announcements_channels_check CHECK (channels IN ('in_app', 'email', 'both')),
  CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'sending', 'sent', 'partially_failed')),
  CONSTRAINT announcements_recipient_count_check CHECK (recipient_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_recipients (
  announcement_id UUID NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  in_app BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_recipients_person
  ON announcement_recipients (person_id, created_at DESC) WHERE in_app;

CREATE TABLE IF NOT EXISTS announcement_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  address CITEXT NOT NULL,
  address_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  claimed_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcement_email_deliveries_kind_check CHECK (address_kind IN ('personal', 'institutional')),
  CONSTRAINT announcement_email_deliveries_status_check CHECK (
    status IN ('queued', 'sending', 'sent', 'failed', 'skipped_opted_out')
  ),
  CONSTRAINT uq_announcement_email_deliveries_address UNIQUE (announcement_id, address)
);

CREATE INDEX IF NOT EXISTS idx_announcement_email_deliveries_queue
  ON announcement_email_deliveries (created_at) WHERE status IN ('queued', 'sending');

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS announcement_emails_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS announcement_emails_opt_out_at TIMESTAMPTZ;

DO $$
DECLARE
  me text := current_user;
  can_bypass boolean;
  t record;
BEGIN
  SELECT rolbypassrls OR rolsuper INTO can_bypass FROM pg_roles WHERE rolname = me;
  FOR t IN
    SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relname IN ('announcements', 'announcement_recipients', 'announcement_email_deliveries')
  LOOP
    IF NOT coalesce(can_bypass, false) AND NOT pg_has_role(me, t.owner, 'USAGE') THEN
      RAISE EXCEPTION
        'Row-level security not enabled: role "%" neither owns table public.% (owner "%") nor has BYPASSRLS.',
        me, t.relname, t.owner;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;
