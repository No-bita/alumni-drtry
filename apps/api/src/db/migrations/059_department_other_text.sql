-- Members who pick the generic "Other" department specify their actual department as
-- free text (required at onboarding, editable later while the department choice stays
-- locked). Kept separate from the signup-parser columns (department_code/department_name):
-- those hold email guesses and are suppressed for non-BHU emails.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS department_other_text TEXT;

ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_department_other_text_check;

ALTER TABLE people
  ADD CONSTRAINT people_department_other_text_check
  CHECK (department_other_text IS NULL OR char_length(btrim(department_other_text)) BETWEEN 1 AND 80);
