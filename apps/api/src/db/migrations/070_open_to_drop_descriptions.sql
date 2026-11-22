-- The line under each "Open to" tag was removed from the app. This deletes every saved line
-- (approved: clear them all at once). It cannot be undone. Tags and coffee limits are kept.

-- Current shape: { "selected": [...], "descriptions": {...}, "limits": {...} }
UPDATE people
SET open_to_preferences = open_to_preferences - 'descriptions'
WHERE jsonb_typeof(open_to_preferences) = 'object'
  AND open_to_preferences ? 'descriptions';

-- Oldest shape: { "referrals": { "enabled": true, "description": "..." }, ... }
UPDATE people
SET open_to_preferences = (
  SELECT jsonb_object_agg(
    entry.key,
    CASE WHEN jsonb_typeof(entry.value) = 'object' THEN entry.value - 'description' ELSE entry.value END
  )
  FROM jsonb_each(people.open_to_preferences) AS entry
)
WHERE jsonb_typeof(open_to_preferences) = 'object'
  AND NOT open_to_preferences ? 'selected'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(people.open_to_preferences) AS entry
    WHERE jsonb_typeof(entry.value) = 'object' AND entry.value ? 'description'
  );

COMMENT ON COLUMN people.open_to_preferences IS
  'Alumni "Open to" tags: { selected: [ids], limits?: { coffee } }. Older rows may use { id: { enabled } }.';
