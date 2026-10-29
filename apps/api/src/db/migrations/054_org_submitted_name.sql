-- Company review "Edit name": keep the name as it was first typed, so a rename can be checked and undone by hand.
-- Empty until the first rename; later renames keep the first original.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS submitted_name TEXT;
