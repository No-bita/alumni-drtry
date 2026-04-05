# Bulletin Phase 1 Spec

This spec converts the approved optimization decisions into an implementation-ready contract for the current codebase.

## Optimized decisions locked for Phase 1

- **Scope:** no reports, spam checks, rate limits, load testing suite, or metrics pipeline.
- **State model:** only `open` and `closed` (drop `removed` and `expired` runtime states for Phase 1 API semantics).
- **Moderation placeholder:** use `closed_reason = 'moderated'` in Phase 2.
- **Category model:** required controlled enum with exactly 4 categories.
- **Pagination:** `limit` + `offset`.
- **Edit window:** required, 5-minute grace after create.
- **Notifications:** required email to post author on each new response.
- **Composer quality:** 6 explicit rules shown and enforced in UI.
- **Response model:** free-text message in DB; personal email never in API payloads.
- **Ranking rule:** slight boost for recent posts with zero responses.  
  **Authoritative detail:** [bulletin-feed-ranking.md](./bulletin-feed-ranking.md) — **keep in sync** whenever feed SQL changes.

---

## 1) Backend API contract (Phase 1)

All routes are authenticated.

### 1.1 Types

- `BulletinCategory` enum (required):
  - `hiring`
  - `mentorship`
  - `collaboration`
  - `guidance`
- `BulletinStatus`:
  - `open`
  - `closed`
- `CloseReason`:
  - `manual`
  - `edit_replaced`
  - `moderated` (reserved for Phase 2 use)

### 1.2 Endpoints

- **POST** `/v1/intentcasts`
  - body:
    - `category: BulletinCategory` (required)
    - `content: string` (required, trimmed, min/max bounded)
  - returns: `{ intentcast }`

- **GET** `/v1/intentcasts`
  - query:
    - `limit: number` (default 20, max 100)
    - `offset: number` (default 0, max sensible cap)
    - `category?: BulletinCategory`
    - `status?: open|closed` (default open)
    - `mine?: boolean` (optional)
  - returns:
    - `intentcasts: IntentcastFeedItem[]`
    - `pageInfo: { hasMore: boolean; nextOffset: number | null }`

- **PATCH** `/v1/intentcasts/:id` (author only; within 5 minutes)
  - body:
    - `category?: BulletinCategory`
    - `content?: string`
  - behavior:
    - outside 5-minute window => `409 INTENTCAST_EDIT_WINDOW_EXPIRED`
  - returns: `{ intentcast }`

- **PATCH** `/v1/intentcasts/:id/close` (author only)
  - body optional:
    - `reason?: 'manual'` (default manual)
  - returns: `204`

- **POST** `/v1/intentcasts/:id/respond`
  - body:
    - `message: string` (required, trimmed, min/max bounded)
  - behavior:
    - stores response row
    - triggers required email to author
  - returns: `{ response }`

- **GET** `/v1/intentcasts/:id/responses` (author only in Phase 1)
  - returns: `{ responses }`

### 1.3 Feed ranking (Phase 1)

Sort key priority:
1. `is_open` first
2. `zero_response_boost` first (`response_count = 0` and recent)
3. `created_at DESC`
4. `id DESC`

`zero_response_boost` rule:
- apply only when `response_count = 0`
- apply only for recent posts (for example: created in last 48 hours)

---

## 2) Data model and migration plan (Phase 1)

Use existing tables and add/adjust minimal columns.

### 2.1 `intentcasts`

Required fields for Phase 1:
- `id`
- `author_person_id`
- `category` (enum or constrained text)
- `content`
- `status` (`open` | `closed`)
- `closed_reason` nullable
- `closed_at` nullable
- `closed_by_person_id` nullable
- `editable_until` (created_at + 5 minutes)
- `expires_at` (keep existing TTL if desired operationally, but API semantics remain `open|closed`)
- `created_at`
- `updated_at`

Indexes:
- `(status, created_at DESC, id DESC)`
- `(category, status, created_at DESC)`
- `(author_person_id, status, created_at DESC)`
- `(editable_until)` optional helper

### 2.2 `intentcast_responses`

Required fields:
- `id`
- `intentcast_id`
- `responder_person_id`
- `message`
- `created_at`
- `updated_at`

Indexes:
- `(intentcast_id, created_at DESC, id DESC)`
- unique guard if you want one-response-per-person-per-post in Phase 1

### 2.3 Compatibility notes for current repo

Current repo uses:
- cursor pagination in `IntentcastService.listFeed`
- `IntentcastStatus` includes `"expired"`
- `expireOpenIntentcasts()` path

Phase 1 target:
- switch feed to limit/offset contract
- keep expiry job if operationally useful, but map closed/expired behavior consistently to `closed` in API payloads

---

## 3) Notification behavior (required)

On successful response creation:
1. Resolve author identity and profile-safe metadata.
2. Send email to author personal/institutional configured recipient.
3. Do not include responder personal email in API response payload.

Failure policy:
- if DB write succeeds and email fails, keep response committed and log email failure for retry/manual follow-up.

---

## 4) Frontend contract (Phase 1)

### 4.1 Composer UI

Required fields:
- category (4-option controlled selector)
- content textarea

Display and enforce 6 rules (example wording):
1. Be specific about what you need or offer.
2. Keep it concise and actionable.
3. Mention relevant batch/department context when helpful.
4. No personal contact details in post body.
5. Be respectful and professional.
6. No duplicate reposts within short intervals; edit your existing post in the 5-minute window.

### 4.2 Feed UI

- Filters: category, status (default open), mine
- Pagination: limit/offset “Load more”
- Card fields:
  - author name, dept
  - category badge
  - content
  - response count
  - created relative time
  - status badge
- Rank behavior should match backend output order.

### 4.3 Edit and close UX

- Show edit action only while `now <= editable_until`.
- Show countdown/hint during edit window.
- Close action always available while open.
- If edit window expired, show clear error copy.

### 4.4 Response UX

- Inline response composer on card/detail.
- Success confirmation copy should mention author is notified by email.

---

## 5) File-by-file implementation checklist (current codebase)

Backend:
- `apps/api/src/routes/intentcastRoutes.ts`
  - add `category` to create schema
  - add `offset`/filters to feed schema
  - add edit route `PATCH /v1/intentcasts/:id`
- `apps/api/src/services/intentcastService.ts`
  - enforce category enum + content rules
  - switch feed from cursor to limit/offset
  - add edit-window policy (`editable_until`)
  - trigger email notification in `respondToIntentcast`
- `apps/api/src/repos/intentcastRepo.ts`
  - add category + editable_until persistence
  - implement limit/offset feed query + zero-response boost sort
  - add update method for edits constrained by `editable_until`
  - normalize status mapping for Phase 1 API semantics
- `apps/api/src/jobs/expireIntentcasts.ts`
  - keep only if you still want TTL closure; ensure status output consistency
- `apps/api/src/db/migrations/*`
  - migration for category + editable_until + indexes

Frontend:
- `apps/web/src/api/client.ts`
  - extend `IntentcastFeedItem` with `category`, `editableUntil`
  - update feed query usage for `offset`
- `apps/web/src/pages/Home.tsx`
  - update bulletin widget to show category and offset pagination if needed
  - response success text: author notified
- (recommended) new `apps/web/src/pages/Bulletin.tsx`
  - full composer + filters + list + edit/close flows

Docs:
- update `docs/user-journey-and-testing.md` with bulletin journey test cases
- add Phase 1 API examples once implemented

---

## 6) Phase 1 acceptance criteria

- User can create a bulletin post with required category.
- Feed supports category + status + mine filters via limit/offset.
- Author can edit for 5 minutes only.
- Author can close own open post.
- Other users can respond with message.
- Author receives email on each response.
- API never exposes personal email in bulletin payloads.
- Feed visibly boosts recent unanswered posts.

