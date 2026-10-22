-- Referral asks: structured job / resume listing URLs.
-- Previously packed into `content` as "Role link:" / "Resume link:" lines by the web composer;
-- now stored in their own columns so the fit answer keeps its own budget and labels cannot collide.
ALTER TABLE intentcasts
  ADD COLUMN IF NOT EXISTS role_listing_url TEXT,
  ADD COLUMN IF NOT EXISTS resume_listing_url TEXT;
