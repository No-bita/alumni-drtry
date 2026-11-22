-- Onboarding can only finish with the identity it asks for: name, department (plus the typed
-- department name when it is "Other"), degree and graduation year. Those fields freeze once
-- onboarding is done, so a profile must never be marked complete while one is missing.
--
-- Checked at the moment a profile becomes complete (profile_completed_at or onboarding_completed_at
-- going from empty to set, or a row created already complete). Rows that are already complete are
-- not re-checked on later updates.
CREATE FUNCTION people_require_identity_on_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  becomes_complete boolean;
  dept_code text;
BEGIN
  becomes_complete :=
    (NEW.profile_completed_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.profile_completed_at IS NULL))
    OR (NEW.onboarding_completed_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.onboarding_completed_at IS NULL));
  IF NOT becomes_complete THEN
    RETURN NEW;
  END IF;

  IF NEW.department_id IS NOT NULL THEN
    SELECT code INTO dept_code FROM departments WHERE id = NEW.department_id;
  END IF;

  IF btrim(COALESCE(NEW.full_name, '')) = ''
     OR NEW.department_id IS NULL
     OR (dept_code = 'other' AND btrim(COALESCE(NEW.department_other_text, '')) = '')
     OR NEW.degree_id IS NULL
     OR NEW.batch_year IS NULL THEN
    RAISE EXCEPTION 'A profile needs a name, department, degree and graduation year before onboarding is complete.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'people_identity_required_on_completion';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER people_identity_required_on_completion
  BEFORE INSERT OR UPDATE OF profile_completed_at, onboarding_completed_at ON people
  FOR EACH ROW EXECUTE FUNCTION people_require_identity_on_completion();
