# Cost and request optimization audit

**Goal:** Reduce hosting and database cost by cutting **unnecessary HTTP requests**, **duplicate fetches**, and **expensive backend work** (writes, heavy reads), without sacrificing core product behavior.

**Scope:** `apps/web`, `apps/api`, and how they interact. For bundle/UI-only ideas, see [`web-app-optimizations.md`](./web-app-optimizations.md).

---

## How cost shows up in this stack

| Lever | Typical cost driver |
|--------|---------------------|
| **Neon / Postgres** | Query time, connection minutes, storage (analytics tables, `search_log`), write volume |
| **API compute** | CPU per request; scales with request count and query complexity |
| **Egress** | JSON payload size × requests (e.g. `limit=100` search on Home) |
| **Client** | Mostly indirect (battery, UX); fewer calls also reduce server load |

Prioritize **fewer round-trips**, **smaller hot paths**, **deduplicated data**, and **cheaper observability** (sampling, toggles).

---

## Backend (`apps/api`)

### 1. One DB `INSERT` on every directory search

**Where:** `discoveryRoutes` → `adminMetricsService.logSearch()` → `INSERT INTO search_log`.

**Impact:** Every successful `GET /v1/search` does an extra write. At scale this is pure overhead unless you actively use `searchVolume` in `GET /v1/admin/metrics`.

**Options (pick one):**

- **Sample:** e.g. log 1 in N searches (env-driven).
- **Async / fire-and-forget:** don’t block the search response on `logSearch` finishing (careful with process exit in serverless).
- **Disable in prod** via env if metrics are not reviewed.
- **Aggregate in app:** periodic counter in Redis/memory, flush to DB (multi-instance needs shared store).

### 2. Discovery analytics writes

**Where:** `DISCOVERY_ANALYTICS_ENABLED` → `discovery_search_sessions` + optional `discovery_profile_click_events`.

**Impact:** Every first page of search can insert a session row; every profile click from the directory UI can insert a click row.

**Options:**

- Set **`DISCOVERY_ANALYTICS_ENABLED=false`** when you don’t need funnels (tests already may tune this).
- **Debounce or batch** profile-click events on the client (single POST per navigation burst) or **sample** server-side.
- Define **retention** (delete old rows on a schedule) to cap storage cost.

### 3. Auth: two round-trips on every session refresh

**Where:** `AuthContext` uses `Promise.all` of `GET /v1/me` and `GET /v1/me/profile`.

**Impact:** Two queries (and two HTTP hops) whenever `refetch()` runs. Fine for correctness; expensive if `refetch` is called often from many places.

**Options:**

- Add **`GET /v1/me/session`** (or extend `/v1/me`) to return **`person` + `profile`** in one JSON payload and one handler that shares DB access—halves auth-shaped traffic on cold load and refetch.
- Call **`refetch` only when needed** (after profile mutations, verify)—not on every focus if you add that later.

### 4. Heavy reads

**Where:** Directory search SQL (already has `DISCOVERY_SEARCH_STATEMENT_TIMEOUT_MS`), Home uses **`limit=100`** for the batch snapshot.

**Impact:** Large JSON and heavier queries than `limit=20` search pages.

**Options:**

- **Lower Home batch limit** (e.g. 30–50) if UX allows “100+” style labeling from `hasMore`.
- Ensure **indexes** match filters (see `docs/directory-search.md`).

### 5. N+1 patterns to watch

**Where:** Bulletin author inline replies: when `showInlineAuthorReplies` is on, the UI can **`GET /v1/intentcasts/:id/responses` per post** with responses (`BulletinPanel.tsx`).

**Impact:** 1 feed request + N response requests per author view.

**Options:**

- **API:** `GET /v1/intentcasts?mine=true&includeResponses=true` (single query shape) or cap concurrent client fetches.
- **Client:** fetch responses **lazily** when the card expands, not for all cards at once.

---

## Frontend (`apps/web`)

### 1. TanStack Query is underused

**Where:** `Search.tsx` correctly uses **`useInfiniteQuery`** (dedupe, abort, cache key). Most other screens use **`useEffect` + `api.get`** with **no shared cache**.

**Impact:** Navigating **Home → Profile → Home** refetches everything; React Query defaults in `queryClient.ts` rarely apply.

**Options:**

- Migrate hot paths to **`useQuery` / `useMutation`** with stable **`queryKey`s: `/v1/me/profile`, `/v1/me/occupations`, public `/v1/profiles/:id`, inbox, notifications.
- Use **`staleTime`** (e.g. 1–5 minutes) for “directory” and profile data; **`invalidateQueries`** after PATCH profile / links / occupations.

### 2. Duplicate `GET /v1/profiles/:id` when viewing yourself

**Where:** `Profile.tsx` always loads **`/v1/profiles/:id`** even when `id === auth.myProfile?.id`.

**Impact:** Extra search-rate bucket hit + DB read; data often already in **`AuthContext`**.

**Options:**

- If **`id` matches** signed-in profile id, **hydrate from `auth.myProfile`** (and merge with a minimal fetch only for fields not in context, or extend auth payload).
- Or rely on a **single composite** session endpoint (see backend §3).

### 3. Nav notification badge polling

**Where:** `Nav.tsx` — `GET /v1/notifications/summary` on mount, **`setInterval` every 120s**, and on `visibilitychange`.

**Impact:** Low per request (aggregate query), but **every signed-in tab** hits this on a schedule.

**Options:**

- Increase interval (e.g. **5 min**) or poll **only while visible** and skip interval when `document.hidden`.
- Long term: **SSE** or **push** (higher build cost).

### 4. Onboarding parallel fetches

**Where:** Onboarding `useEffect` kicks off **`/v1/me/occupations`** and **`/v1/me/links`** together even when the user is on step 0–1.

**Impact:** Two requests early; links may be unused until later steps.

**Options:**

- **Defer `GET /v1/me/links`** until the links step mounts (or when `stepIndex >= 3`).

### 5. Home dashboard

**Where:** On load: **`GET /v1/me/occupations`** + **`GET /v1/search?...&limit=100`** (batch snapshot).

**Impact:** One heavy search per Home visit.

**Options:**

- **React Query** with **`staleTime`** so quick return visits don’t refetch.
- Reduce **`limit`** if product accepts it (see backend §4).
- Home “meet” suggestions are **not** implemented on the current home page—fewer directory calls.

### 6. Directory analytics: `profile-click`

**Where:** `SearchResultRow.tsx` / `LocationDirectoryCard.tsx` → **`POST /v1/discovery/analytics/profile-click`**.

**Impact:** One write per click; rapid scrolling can mean many requests.

**Options:**

- **Debounce** (e.g. only send for “opened” profile or after 300ms hover).
- **Batch** clicks in memory, flush on `beforeunload` or every N seconds (more complex).

### 7. `api.client.ts` behavior

**Where:** Always parses **`res.json()`** on responses.

**Impact:** Minor CPU; only worth touching if you add many `204` routes.

---

## Quick wins checklist (prioritized)

| Priority | Action | Effort | Saves |
|----------|--------|--------|--------|
| P0 | Sample or env-disable **`logSearch`** | Low | 1 write per search |
| P0 | Turn off **`DISCOVERY_ANALYTICS_ENABLED`** if unused | Trivial | Session + click writes |
| P1 | **`useQuery`** for profile / occupations / notifications list + sane `staleTime` | Medium | Repeat visits, tab churn |
| P1 | **Own profile:** skip `GET /profiles/self` when id matches auth | Low | 1 read + rate bucket per visit |
| P1 | Bulletin: **lazy** or **batched** responses when `showInlineAuthorReplies` | Medium–High | N requests → 1 or on-demand |
| P2 | **Composite `GET /v1/me/session`** | Medium | 2 → 1 request on auth refresh |
| P2 | Nav summary: **longer interval** or visible-only polling | Low | Steady-state chatter |
| P2 | Onboarding: **defer links** fetch | Low | 1 request on early steps |
| P2 | Home batch **`limit`** tuning | Low | Query + egress |

---

## Related docs

- [`web-app-optimizations.md`](./web-app-optimizations.md) — bundle, virtualization, rendering.
- [`directory-search.md`](./directory-search.md) — search contract and indexes.
- [`production-shipping-checklist.md`](./production-shipping-checklist.md) — launch buckets; **Implementation reference** for session cookies, audits, search query shape.

---

*This audit reflects the repository layout and patterns as of the document date; re-grep for `api.get` / `api.post` when adding features.*
