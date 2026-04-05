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

## Ordering (ranking)

Posts are **not** ranked by likes, replies, or category popularity. Order is deterministic:

1. **Primary — boost “unanswered and recent”**  
   Posts with **zero responses** and **`created_at` within the last 48 hours** sort **before** all other posts.  
   (In SQL this is a `CASE` expression: that group = `0`, everything else = `1`, ascending.)

2. **Secondary — recency**  
   Within each group: **`created_at DESC`** (newest first).

3. **Tie-break**  
   **`id DESC`** for stable ordering when timestamps match.

## Pagination

`limit` + `offset` are applied **after** this ordering. Page 2 continues the same global order; it is not a separate “rank.”

## Related docs

- High-level Phase 1 note: [bulletin-phase1-spec.md](./bulletin-phase1-spec.md) (see “Ranking rule”)
- UI for the feed: [bulletin-design-principles.md](./bulletin-design-principles.md) (presentation only; not ordering)

---

**Maintenance:** Any PR that modifies bulletin feed ordering or feed filters should **update this file** and, if useful, the one-line comment in `intentcastRepo.ts` next to `ORDER BY`.
