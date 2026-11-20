-- Two durable slots enforce the global cap even under concurrent admin requests.
-- Unpinning clears a slot rather than deleting its record.
CREATE TABLE wall_post_pins (
  slot SMALLINT PRIMARY KEY CHECK (slot IN (1, 2)),
  intentcast_id UUID UNIQUE REFERENCES intentcasts(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ,
  pinned_by_person_id UUID REFERENCES people(id) ON DELETE SET NULL
);
INSERT INTO wall_post_pins (slot) VALUES (1), (2);

-- Existing manual close/removal rules remain valid even when automatic expiry is disabled.
CREATE FUNCTION clear_unavailable_wall_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'open' OR NEW.author_soft_deleted_at IS NOT NULL THEN
    UPDATE wall_post_pins SET intentcast_id = NULL, pinned_at = NULL, pinned_by_person_id = NULL
      WHERE intentcast_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER intentcast_clear_wall_pin
  AFTER UPDATE OF status, author_soft_deleted_at ON intentcasts
  FOR EACH ROW EXECUTE FUNCTION clear_unavailable_wall_pin();

-- API-owned table only, matching the existing private-table RLS convention.
ALTER TABLE wall_post_pins ENABLE ROW LEVEL SECURITY;
