# Bulletin feed — ranking rules

This document is the **authoritative description** of how posts appear in the bulletin (intentcast) feed. **Whenever you change ordering, filtering, or boost logic for `GET /v1/intentcasts`, update this file in the same PR** so product and frontend stay aligned with the API.

## Source of truth

- **Implementation:** `apps/api/src/repos/intentcastRepo.ts` → `listFeed()`
- **HTTP:** `GET /v1/intentcasts` → `IntentcastService.listFeed()` → `listFeed()` above

If the SQL `ORDER BY` or feed `WHERE` clauses change, edit this doc.

## Eligibility (not ranking)

Rows must satisfy the query’s `WHERE` conditions before ordering applies. In brief, the feed includes intentcasts that are:

- Not expired (`expires_at > now()`)
- Not **author soft-deleted** for other viewers: if `author_soft_deleted_at` is set, only the author still sees the row until it is purged from the database after the retention window
- Matching the requested `status` (default `open`) and optional `category` / `mine`
- Authored by a **visible** person: not deleted, not suspended, and with a non-null `full_name`

Exact predicates live in `listFeed()` — **do not duplicate them here verbatim** unless you are updating this doc after a code change.

## Home Wall pins

`scope=home_wall` opts the shared, open feed into Wall pin ranking. It cannot be combined with `mine`, `authorHistory`, or closed status. Careers and other feeds keep the ordering below and receive no pin marker.

For Home Wall only, visible pinned posts sort before the normal ranking, newest `pinned_at` first. This happens in SQL before pagination. All existing post and author eligibility checks still apply. Pinning is not a visibility or audience override. The post audience rule (`audienceVisibleSql`, see [post-audience.md](./post-audience.md)) applies in both the feed and `findFeedItemVisibleToViewer`, which also gates pin mutations. Admins see every post, so they can pin a restricted one. Members outside its audience still don't see it, and the pinned card shows "Visible to: …".

Admins and super-admins can use `PATCH /v1/admin/intentcasts/:id/pin` with `{ "pinned": true }` or `{ "pinned": false }`. Demo sessions cannot mutate pins. Two fixed database slots enforce a global maximum of two pins, including concurrent requests. Re-pinning an already pinned post is idempotent and keeps its original time. At the limit, a new pin returns `WALL_PIN_LIMIT`; an admin must unpin a post explicitly. No notifications are sent.

Manual close or author removal clears the pin slot without reopening or restoring the post. A pin never grants edit or delete rights. The Home UI displays both a pin icon and a `Pinned` label to viewers; only admins receive pin/unpin menu actions.

## Opportunities for you (`scope=home_wall&sort=for_you`)

Home's "Opportunities for you" panel is the Home Wall ranked for the viewer. `sort=for_you` needs `scope=home_wall` (400 otherwise). The viewer's own posts are left out. All other eligibility rules apply as usual.

Order, applied in SQL before pagination:

1. **Pins**, as for the Home Wall.
2. **Demo viewer + demo author**, as in the default order below.
3. **Tier 1: matching hiring.** Hiring posts whose function equals the viewer's job function and whose experience band equals the viewer's (from graduation year).
4. **Tier 2: asks the viewer can help with.** Any of:
   - a referral ask ("Looking for referral for {role} at {company}") whose company equals the viewer's current company (canonical name when merged);
   - a Guidance post, and the viewer is Open to Mentorship or Advising;
   - a Startups post, and the viewer is Open to Advising or Collaboration;
   - one of the viewer's areas appears in the post as a whole term, not inside a longer word.
5. **Tier 3: everything else.**

Within each tier: `created_at DESC`, then `id DESC`. The default order's "unanswered and recent" boost does not apply here.

Job function is a new field, so tier 1 starts small until members fill it in.

## Ordering (ranking)

After the Home-only pin priority, posts are **not** ranked by likes, replies, or category popularity. Order is deterministic:

1. **Primary — demo viewer + demo author**  
   When the **viewer** matches demo/test alumni (`personIsDemoSql` on the viewer’s `people` row) **and** the **author** is also demo/test, those intentcasts sort **first**. This keeps seeded batch-demo bulletin posts visible on Home for demo accounts without changing ordering for normal production viewers.

2. **Secondary — boost “unanswered and recent”**  
   Among remaining rows: posts with **zero responses** and **`created_at` within the last 48 hours** sort **before** older or already-replied posts.

3. **Tertiary — recency**  
   Within each group: **`created_at DESC`** (newest first).

4. **Tie-break**  
   **`id DESC`** for stable ordering when timestamps match.

## Pagination

`limit` + `offset` are applied **after** this ordering. Page 2 continues the same global order; it is not a separate “rank.”

## Related docs

- High-level Phase 1 note: [bulletin-phase1-spec.md](./bulletin-phase1-spec.md) (see “Ranking rule”)
- UI for the feed: [bulletin-design-principles.md](./bulletin-design-principles.md) (presentation only; not ordering)

---

**Maintenance:** Any PR that modifies bulletin feed ordering or feed filters should **update this file** and, if useful, the one-line comment in `intentcastRepo.ts` next to `ORDER BY`.
