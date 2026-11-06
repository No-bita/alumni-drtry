-- Database lock: turn on row-level security for every table in `public`, with no policies.
--
-- What this does
--   * The API connects as the role that owns these tables (or one with BYPASSRLS), so it keeps full
--     access: owners are not subject to row security unless FORCE is set, and we never set FORCE.
--   * Every other role (for example Supabase's `anon` and `authenticated`, used by its Data API)
--     sees zero rows and cannot write, even if the Data API is switched on by mistake.
--   * The Supabase roles also lose all table, sequence and function privileges in `public`, now and
--     for objects created later by this role.
--
-- Safety: before changing anything, check that the role running this migration (the API's role)
-- owns every table or has BYPASSRLS. If not, stop here instead of locking the app out of its own
-- data. Works on plain Postgres (local, CI) where the Supabase roles don't exist.
DO $$
DECLARE
  t record;
  me text := current_user;
  can_bypass boolean;
BEGIN
  SELECT rolbypassrls OR rolsuper INTO can_bypass FROM pg_roles WHERE rolname = me;

  FOR t IN
    SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    IF NOT coalesce(can_bypass, false) AND NOT pg_has_role(me, t.owner, 'USAGE') THEN
      RAISE EXCEPTION
        'Row-level security not enabled: role "%" neither owns table public.% (owner "%") nor has BYPASSRLS. Run migrations as the table owner (the role in DATABASE_URL).',
        me, t.relname, t.owner;
    END IF;
  END LOOP;

  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated';
  END IF;
END
$$;
