-- Remove all automated test people (e2e* institutional locals; see is_test_user / testUser.ts).
-- Run against staging/prod only when you intend to delete these accounts.
-- Sessions, occupations, links, etc. CASCADE from people (see FKs).

BEGIN;

DELETE FROM people WHERE is_test_user = TRUE;

COMMIT;
