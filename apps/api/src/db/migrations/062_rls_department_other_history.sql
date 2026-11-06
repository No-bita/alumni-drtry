-- Row-level security catch-up for department_other_history.
--
-- 060_department_other_review runs after 058_row_level_security and creates
-- department_other_history, so that table never got row-level security and the
-- hardening guard test (securityHardening.e2e.test.ts) flags it. This migration
-- extends the same guarantee to that one table only: row security enabled, no
-- policies, so the API role (owner or BYPASSRLS) keeps full access and every
-- other role sees zero rows. No role or privilege changes.
--
-- Safety mirrors 058: if the migrating role neither owns the table nor has
-- BYPASSRLS, stop instead of locking the app out of its own data.
DO $$
DECLARE
  me text := current_user;
  can_bypass boolean;
  t_owner text;
BEGIN
  SELECT rolbypassrls OR rolsuper INTO can_bypass FROM pg_roles WHERE rolname = me;
  SELECT pg_get_userbyid(c.relowner) INTO t_owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'department_other_history' AND c.relkind IN ('r', 'p');
  IF t_owner IS NULL THEN
    RAISE EXCEPTION 'department_other_history not found; run 060_department_other_review before this migration';
  END IF;
  IF NOT coalesce(can_bypass, false) AND NOT pg_has_role(me, t_owner, 'USAGE') THEN
    RAISE EXCEPTION
      'Row-level security not enabled: role "%" neither owns table public.department_other_history (owner "%") nor has BYPASSRLS. Run migrations as the table owner (the role in DATABASE_URL).',
      me, t_owner;
  END IF;
  ALTER TABLE public.department_other_history ENABLE ROW LEVEL SECURITY;
END
$$;
