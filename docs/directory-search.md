# Directory search (`GET /v1/search`)

Operational reference for the alumni directory: **canonical API contract**, **what is implemented today**, and **target behaviour** (Phase 1). Product and ranking design live in [`directory-search-implementation-plan.md`](./directory-search-implementation-plan.md).

---

## Canonical query parameters (contract)

Single naming scheme — use these in new clients, URLs, and docs. **`company` is plain text** (substring on the organization name linked to an occupation); you do **not** pass an organization id.

| Parameter | Type | Role (Phase 1 target) |
|-----------|------|------------------------|
| `q` | string, max 120 | Free-text / residual keyword after normalization. |
| `batch` | int | **Primary (strict)** — **graduating year only** (`people.batch_year`); joining year is not used for this filter. |
| `dept` | string | **Primary (strict)** — canonical department code (lowercase). |
| `company` | string, max 120 | **Primary (strict) when set** — only profiles with an **occupation** linked to an org whose **name** contains this substring (trimmed, case-insensitive). Omit the param to search all employers. |
| `occ` | string | **Secondary (soft)** — occupation **type** code; boosts when any occupation matches; does not exclude non-matches. |
| `residenceCountry` | string | Optional substring filter on residence (trimmed, case-insensitive). |
| `residenceCity` | string | Optional substring filter on residence (trimmed, case-insensitive). |
| `limit` | int | Default **20**, min **1**, max **100**. |
| `cursor` | string | Opaque keyset cursor from `pageInfo.nextCursor`. |

**Not in Phase 1:** `GET /v1/search/preview`, `GET /v1/search/distribution` (Discovery) — see implementation plan.

---

## Target behaviour (Phase 1 — not fully shipped)

Summarized from [`directory-search-implementation-plan.md`](./directory-search-implementation-plan.md):

| Area | Target |
|------|--------|
| **Ranking** | **Rule-based:** exact **name** match first, **title** match next, then **completeness** (usefulness-weighted) + tie-breaks — **not** weighted numeric `ts_rank` math in Phase 1. |
| **Intent** | Lightweight **name vs role/topic vs company** signals before search. |
| **Filters** | **Batch + dept strict**; **`company` strict when set** (employer substring on linked org); **`occ` soft** (rank boost only). |
| **Widening** | **Progressive** candidate pool (e.g. nearby batches); same ranking rules; optional `widening_summary` / `message_key` on response. |
| **Normalization** | Parse `q` + chips into structured fields (dept, batch, company aliases, residual `q`). |
| **Diversity** | Light caps so the top of the list is not all one company/batch. |
| **Transparency** | Optional per-result **`matchReasons`** (e.g. “Same batch”, “Matches: product manager”). |
| **Analytics** | Log query, positions, clicks for future tuning (in addition to coarse `search_log`). |
| **Skills** | Not collected or indexed; keyword search uses name, bio, residence, occupations, and org names only. |
| **Browse tie-break** | `profile_completed_at` where applicable. |

---

## Shipped implementation (today)

**`GET /v1/search` accepts** the canonical keys: `q`, `batch`, `dept`, `company`, `occ`, residence fields, `limit`, `cursor`. Legacy names (`keyword`, `batchYear`, …) are **not** supported.

### Endpoint

| Item | Detail |
|------|--------|
| Method / path | `GET /v1/search` |
| Auth | Required (session cookie). Anonymous directory is not supported. |
| Response | `results`, `pageInfo`, optional `wideningSummary` / `messageKey`, optional `normalization` (when query normalization runs), optional `searchSessionId` (analytics) |

### Behaviour (current)

- **Primary filters (strict):** `batch` (exact `batch_year`), `dept` (canonical code), residence filters, **`q`** when present (FTS predicate), and **`company`** when present (must have a matching occupation-linked organization name). **`occ` is soft:** it boosts rank and surfaces in **`matchReasons`**; rows without a matching occupation type are still returned.
- **Batch widening:** On the **first** page (no `cursor`), if `batch` is set and a strict batch query returns **no rows**, the API retries with **`batch ± 1`** and sets **`wideningSummary`** + **`messageKey`** (e.g. `batch_widened_plus_minus_one`). **`pageInfo.nextCursor`** encodes whether widening was used (`cursor` v3 includes `bw`); keep using that cursor for “load more” so the widened range stays consistent.
- **`q`:** Full-text search (`simple` config) over profile fields, occupations, org names — same surface as before. Optional **query normalization** (`DISCOVERY_NORMALIZE_QUERY=true`): parses graduation year, known department codes, and org aliases from **`q`** into structured params; response may include **`normalization`** describing merges (MVP).
- **Sort order:** Rule-based rank (tiers + completeness + tie-breaks); keyset cursor follows that ordering (v3; v2 cursors still decode for older clients).
- **`matchReasons`:** Each **`SearchProfileView`** may include machine keys (e.g. `company_match` when `company` was set — backed by column `soft_company_match` in the repo); the web app maps them to short labels.
- **Analytics (optional):** Migration **`015_discovery_analytics.sql`**. When **`DISCOVERY_ANALYTICS_ENABLED`** is true (default), the first search page records a session snapshot; **`POST /v1/discovery/analytics/profile-click`** records clicks (with session id from search response).

### Viewer exclusion

The authenticated user’s **`personId`** is always **excluded** from `results` (`excludePersonId` in `DiscoveryService`).

### Eligibility (who can appear in search results)

A row is returned only if **all** hold (see `DiscoveryRepo.searchProfiles`):

- `people.deleted_at IS NULL`
- `people.suspended_at IS NULL`
- `people.full_name IS NOT NULL`

> **Note:** Older docs referred to `people.is_searchable`. That column was **removed** in migration `012_remove_is_searchable.sql`; directory search **does not** filter on it. Profile completeness still affects onboarding and product rules elsewhere.

---

## Pagination (shipped)

- **Keyset** on the active rank ordering (opaque **`cursor`**; v3 includes tier/completeness/timestamp/`id` and optional **`bw`** for batch widening).
- Changing **any** filter or **`q`** invalidates prior cursors; restart from the first page.
- Server requests **`limit + 1`** internally to set `hasMore`; `nextCursor` comes from the last row returned.

---

## Performance and indexes

- **Single query** for results (no N+1). See [`production-readiness.md`](./production-readiness.md).
- **`search_log`:** each successful search logs via `AdminMetricsService.logSearch()`; admin metrics expose **`searchVolume`**.
- **Discovery analytics tables** (migration **`015_discovery_analytics.sql`**): session + click events for tuning (separate from `search_log`).
- **Indexes:** `004_phase3_discovery.sql`, `008_directory_search_indexes.sql` (GIN FTS on people profile, occupations, organization names; filter paths).

For slow queries: `EXPLAIN (ANALYZE, BUFFERS)` on representative URLs; `ANALYZE` before adding indexes.

---

## Web client (`apps/web`)

- Route **`/search`** uses **canonical** URL keys: `q`, `batch`, `dept`, `company`, `occ`, `residenceCountry`, `residenceCity`. UI copy marks batch, department, and employer (company) as **strict** filters; occupation type remains a **ranking** hint only.
- Search text is debounced (**~400 ms**) before calling **`GET /v1/search`** (no preview endpoint).

---

## Roadmap alignment

| Track | Status |
|-------|--------|
| Baseline (`GET /v1/search`, filters, `q` FTS, cursor, `search_log`, **canonical query params**) | **Shipped** |
| Phase 1 (plan): intent, primary/soft filters, progressive widening, rule rank, normalization, diversity, analytics, `matchReasons` | **Partially shipped** — strict batch/dept/**company** (when set), soft `occ`, ±1 batch widen, normalize MVP (flag), `matchReasons`, analytics schema + write path; intent UI, diversity, dashboards — see plan |
| Weighted numeric scoring, preview, Discovery distribution | **Later / deferred** per plan |

---

## Support: “Why doesn’t this alum show up?”

1. Viewer not signed in (directory requires a session).
2. Subject **deleted** or **suspended**.
3. Subject has **no `full_name`**.
4. **Filters or `q`** exclude them (strict AND on batch, dept, residence, **`company` when set** — requires a matching occupation-linked org name — and **`q` when present**). A set **`occ`** filter alone does **not** exclude non-matches (rank boost only).
5. Viewer is searching for **themselves** — self is always excluded.
6. For **target** behaviour only: subject might appear **lower** after widening or soft **`occ`** ranking — not necessarily excluded.
