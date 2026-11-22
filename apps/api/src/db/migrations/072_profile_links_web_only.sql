-- Profile links must be ordinary web links. The API used to accept any string that parsed as a
-- URL, including javascript: and data: values, which were then used as link destinations.
--
-- Existing rows are kept untouched (decision: keep-and-block). The web app never renders a
-- non-web link as clickable, and the constraint below refuses non-web links on every new save.
-- NOT VALID so existing rows are not re-checked; inserts and updates are enforced from now on.
ALTER TABLE profile_links
  ADD CONSTRAINT profile_links_url_web CHECK (url ~* '^https?://[^[:space:]]+$') NOT VALID;
