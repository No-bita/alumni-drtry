-- Ask → Match funnel, by question category. READ-ONLY.
-- Mirrors apps/api/src/repos/askMatchMetricsRepo.ts (admin card: /v1/admin/metrics/ask-match).
-- Needs migrations 046–048. Set the window on the first line (30 = last 30 days; use 100000 for all time).
--
-- Columns:
--   questions      questions asked on /match (demo accounts are never logged)
--   needs_detail   questions with nothing to search on yet (e.g. "moving to a new city")
--   with_matches   questions that returned at least one alum
--   notes_*        notes sent from a /match card, and what happened to them
--   median_reply_days  median time from note to accept/decline

WITH params AS (SELECT 30 AS window_days),
q AS (
  SELECT COALESCE(category, '(no clear category)') AS category,
         COUNT(*) AS questions,
         COUNT(*) FILTER (WHERE needs_detail) AS needs_detail,
         COUNT(*) FILTER (WHERE result_count > 0) AS with_matches
  FROM match_queries, params
  WHERE created_at >= now() - (params.window_days * interval '1 day')
  GROUP BY 1
),
n AS (
  SELECT COALESCE(source_category, '(no clear category)') AS category,
         COUNT(*) AS notes_sent,
         COUNT(*) FILTER (WHERE status = 'accepted') AS notes_accepted,
         COUNT(*) FILTER (WHERE status = 'declined') AS notes_declined,
         COUNT(*) FILTER (WHERE status = 'pending') AS notes_pending,
         ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - created_at)))
                FILTER (WHERE responded_at IS NOT NULL) / 86400)::numeric, 1) AS median_reply_days
  FROM contact_requests, params
  WHERE source = 'match' AND created_at >= now() - (params.window_days * interval '1 day')
  GROUP BY 1
)
SELECT COALESCE(q.category, n.category) AS category,
       COALESCE(q.questions, 0)      AS questions,
       COALESCE(q.needs_detail, 0)   AS needs_detail,
       COALESCE(q.with_matches, 0)   AS with_matches,
       COALESCE(n.notes_sent, 0)     AS notes_sent,
       COALESCE(n.notes_accepted, 0) AS notes_accepted,
       COALESCE(n.notes_declined, 0) AS notes_declined,
       COALESCE(n.notes_pending, 0)  AS notes_pending,
       n.median_reply_days
FROM q FULL OUTER JOIN n ON q.category = n.category
ORDER BY questions DESC;

-- Totals across all categories (same window):
WITH params AS (SELECT 30 AS window_days)
SELECT
  (SELECT COUNT(*) FROM match_queries, params WHERE created_at >= now() - (params.window_days * interval '1 day')) AS questions,
  (SELECT COUNT(*) FROM match_queries, params WHERE needs_detail AND created_at >= now() - (params.window_days * interval '1 day')) AS needs_detail,
  (SELECT COUNT(*) FROM match_queries, params WHERE result_count > 0 AND created_at >= now() - (params.window_days * interval '1 day')) AS with_matches,
  (SELECT COUNT(*) FROM contact_requests, params WHERE source = 'match' AND created_at >= now() - (params.window_days * interval '1 day')) AS notes_sent,
  (SELECT COUNT(*) FROM contact_requests, params WHERE source = 'match' AND status = 'accepted' AND created_at >= now() - (params.window_days * interval '1 day')) AS notes_accepted,
  (SELECT COUNT(*) FROM contact_requests, params WHERE reminder_sent_at >= now() - (params.window_days * interval '1 day')) AS reminders_sent;
