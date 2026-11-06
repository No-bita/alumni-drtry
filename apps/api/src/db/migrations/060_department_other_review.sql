-- Review workflow for member-typed "Other" departments. Typed text is never public until an
-- admin approves it; while pending or rejected the member has no public department segment at
-- all ("Other" is never shown). Every submission and review action is kept in an append-only
-- history; review columns on people hold only the current state.

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS department_other_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS department_other_reviewed_by UUID REFERENCES people (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_other_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS department_other_rejection_reason TEXT;

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_department_other_status_check;
ALTER TABLE people ADD CONSTRAINT people_department_other_status_check CHECK (
  department_other_status IN ('pending', 'approved', 'rejected')
);

-- Only a rejected submission carries a current reason; earlier reasons stay in the history.
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_department_other_rejection_check;
ALTER TABLE people ADD CONSTRAINT people_department_other_rejection_check CHECK (
  (department_other_status = 'rejected') = (department_other_rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_people_department_other_review_queue
  ON people (department_other_status, updated_at)
  WHERE department_other_status IN ('pending', 'rejected');

CREATE TABLE IF NOT EXISTS department_other_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  actor_person_id UUID REFERENCES people (id) ON DELETE SET NULL,
  submitted_text TEXT,
  target_department_id UUID REFERENCES departments (id) ON DELETE RESTRICT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT department_other_history_action_check CHECK (
    action IN ('submitted', 'approved', 'rejected', 'linked')
  ),
  CONSTRAINT department_other_history_target_check CHECK ((action = 'linked') = (target_department_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_department_other_history_person ON department_other_history (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_department_other_history_created ON department_other_history (created_at DESC);

COMMENT ON TABLE department_other_history IS
  'Append-only record of Other-department text submissions and their approvals, rejections and links to canonical departments.';

-- Append-only: no deletes, and the only update allowed is the anonymising one (actor cleared
-- when a person is hard-deleted, via ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION department_other_history_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'department_other_history is append-only';
  END IF;
  IF NEW.actor_person_id IS NULL
     AND OLD.actor_person_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.person_id = OLD.person_id
     AND NEW.action = OLD.action
     AND NEW.target_department_id IS NOT DISTINCT FROM OLD.target_department_id
     AND NEW.submitted_text IS NOT DISTINCT FROM OLD.submitted_text
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'department_other_history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_department_other_history_append_only ON department_other_history;
CREATE TRIGGER trg_department_other_history_append_only
  BEFORE UPDATE OR DELETE ON department_other_history
  FOR EACH ROW EXECUTE FUNCTION department_other_history_append_only();
