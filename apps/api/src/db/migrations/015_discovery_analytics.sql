-- Directory search analytics: session snapshot + optional profile click-through (dashboards later).

CREATE TABLE IF NOT EXISTS discovery_search_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_person_id uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  query_snapshot jsonb NOT NULL,
  result_ids uuid[] NOT NULL DEFAULT '{}',
  widening_message_key text,
  widening_summary text
);

CREATE INDEX IF NOT EXISTS idx_discovery_search_sessions_viewer_created
  ON discovery_search_sessions (viewer_person_id, created_at DESC);

CREATE TABLE IF NOT EXISTS discovery_profile_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_session_id uuid NOT NULL REFERENCES discovery_search_sessions (id) ON DELETE CASCADE,
  viewer_person_id uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  result_position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_profile_clicks_session
  ON discovery_profile_click_events (search_session_id);
