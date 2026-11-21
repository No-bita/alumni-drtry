-- =====================================================================================================
-- Only if the API must be rolled back to a version without post audience (migration 067).
-- NOT RUN. Needs separate approval before running anywhere. Run one PART at a time.
--
-- Why: an API without this feature ignores the audience columns, so narrowed posts would show to
-- every member. Closing them takes them out of the default Wall feed (which lists open posts only).
-- Closed posts can still be opened by direct link or a "closed" filter on the old API, so this only
-- reduces exposure; it doesn't fully hide them.
--
-- Never deletes anything and never clears the audience columns (they record who each post was for).
-- Closed with closed_reason = 'moderated' so they are distinguishable from author or expiry closes.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- PART 1 — PREVIEW (read-only). Open narrowed posts that would be closed.
-- -----------------------------------------------------------------------------------------------------
SELECT
  i.id,
  i.created_at,
  i.category,
  i.audience_institution_name,
  i.audience_batch_year,
  i.audience_department_name,
  i.audience_place_id
FROM intentcasts i
WHERE i.status = 'open'
  AND (
    i.audience_email_domains IS NOT NULL
    OR i.audience_batch_year IS NOT NULL
    OR i.audience_department_code IS NOT NULL
    OR i.audience_place_id IS NOT NULL
  )
ORDER BY i.created_at DESC;


-- -----------------------------------------------------------------------------------------------------
-- PART 2 — CLOSE (changes data). Run only after PART 1 has been reviewed and approved.
-- -----------------------------------------------------------------------------------------------------
-- BEGIN;
-- UPDATE intentcasts i
-- SET
--   status = 'closed',
--   closed_reason = 'moderated',
--   closed_at = now(),
--   closed_by_person_id = NULL
-- WHERE i.status = 'open'
--   AND (
--     i.audience_email_domains IS NOT NULL
--     OR i.audience_batch_year IS NOT NULL
--     OR i.audience_department_code IS NOT NULL
--     OR i.audience_place_id IS NOT NULL
--   );
-- -- Check the row count matches PART 1, then:
-- COMMIT;
