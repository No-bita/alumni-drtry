# Directory search — implementation plan (v1 spec)

This document captures **target behaviour** for alumni directory search. **Current shipped behaviour** is in [`directory-search.md`](./directory-search.md) (`GET /v1/search`, web `/search`).

**Status:** Baseline search exists; most of this plan is **not** implemented yet.

### Phase 1 direction (revision)

Earlier drafts used **weighted numeric scoring** and a **strict filter AND** + **stepped fallback ladder**. **Phase 1 is now:**

- **Rule-based ranking** (ordered buckets), **not** weighted math yet.
- **Lightweight query-intent** before search runs.
- **Primary vs secondary filters** — not everything is a hard gate.
- **Progressive widening** of the candidate pool instead of discrete “modes” and rigid steps.
- **Query normalization layer** (structured extraction + aliases), not “aliases only.”
- **Completeness** aligned to **decision usefulness**, not raw field counts.
- **Light result diversity** so the top of the list is not repetitive.
- **Analytics logging from day one** (queries, positions, clicks) even if unused initially.
- **“Why this result”** hints on cards for trust.
- **Deferred for now:** numeric weighted formula (old §3.1 style), **`/v1/search/preview`**, **Discovery distribution** (`/v1/search/distribution`), and **Discovery** UX as a product mode.

---

### Decisions (closed) — still in force unless superseded below

| Decision | Answer |
|----------|--------|
| **Browse recency tie-break** | **`people.profile_completed_at`** (with rule-based primary sort per §3). |
| **Skills** | **Not collected** on profiles; excluded from keyword FTS. |
| **Company in URLs** | **`company` is plain text** — substring match on organization **name** (no org id / UUID in the query string). |
| **Preview** | **Skipped for now** — no `/v1/search/preview` in Phase 1. |
| **URL parameters** | **One canonical set** (`q`, `batch`, `dept`, `company`, `cursor`, …) — `occ` **paused** until comprehensive occupation filtering; no dual legacy + new keys (see §9). |

### Superseded / revised (documented in body)

| Old decision | Replacement |
|--------------|-------------|
| All filters **strict AND** | **Primary strict** (batch, dept, **`company` when set**); **`occ` soft (boost)** — §2.2 |
| **Stepped fallback ladder** (1→2→3→4) | **Progressive widening** — same scoring, broader pool, softer UX — §2.3 |
| **`relaxations_applied` + `message_key` per ladder step** | Optional **summary** of widening is still useful; avoid implying one global “correct” sequence — §2.3 |
| Weighted **`keyword_score × 0.60 + …`** in Phase 1 | **Deferred** — Phase 1 uses **§3.2 rule order**; weighted blend is **later** — §8 |

---

## 1. Search modes (product taxonomy)

| Mode | Signal | Behaviour (target) |
|------|--------|---------------------|
| **Lookup** | Apparent **person name** | **Exact name match** ranks **first**; then near matches — §3 |
| **Exploration** | **Keyword / topic** + filters | **Primary filters** gate; **secondary** boost; **progressive widening**; rule-based rank — §2–§3 |
| **Browse** | Filters only (or after normalization) | **Completeness** and **diversity**-aware ordering within widened pool — §3 |
| **Discovery** | Keyword-only + **facets / distribution** | **Not in Phase 1** (no distribution endpoint or dedicated discovery UX yet). |

**Exploration problem statement (updated):** show alumni that **fit the user’s intent**, with **strict** batch/dept when set, **strict employer (`company`) when the user refines by company**, **soft** occupation-type ranking when helpful, **progressively wider** pool when needed, and **transparent** ordering (rules + “why this result”).

---

## 2. Engineering spec

### 2.1 Signal map (Phase 1)

| Signal | Tier | Behaviour |
|--------|------|-----------|
| **Batch year** | **Primary (strict)** | Equality on **`batch_year`** (graduating year only); **`joining_year` is not used** for this filter. |
| **Department** | **Primary (strict)** | Canonical dept code / id when set. |
| **Company (org)** | **Primary (strict) when `company` is set** | **Hard filter:** candidate must have an **occupation** linked to an org whose **name** contains the substring (trimmed, case-insensitive). Applies whether the value came from **Refine** or **query normalization** into `company`. |
| **Occupation type** | **Secondary (soft)** | **Boost** matches; avoid hard exclusion for Phase 1 “feel.” |
| **Name** | Match layer | **Exact** (and ordered rules) — §3.2. |
| **Role / title** | Match layer | **Title match** tier after name — §3.2. |
| **Bio** | Match + completeness | Supports **topic** intent and **medium** completeness weight — §3.3. |

**Skills:** not a profile field; excluded from keyword FTS and ranking.

### 2.2 Combination logic

1. Run **query normalization** (§2.4) + **intent** (§3.1) on raw input.
2. **Primary filters** (batch, department from UI + extracted): **strict** — candidates must match when specified.
3. **`Company` when set** (UI Refine or extracted into the `company` param): **hard AND** on occupation-linked org name (substring). **Occupation type** (`occ`): **boost / score tier only**, not hard exclusion.
4. **Keyword / residual text:** drives **intent** and **match tier** (name vs title vs other).
5. **Browse-only** (no meaningful keyword): order by **§3.2** bottom tier + **§3.3** + **§3.4**.

### 2.3 Progressive widening (replaces rigid fallback ladder)

**Problem with a fixed 1→2→3→4 ladder:** one sequence, hides intent shifts, heavy to maintain, feels like arbitrary **mode switches**.

**Phase 1 approach:**

- Expand the **candidate set** in **layers** (e.g. exact primary filters → **nearby batch years** → relax secondary expectations) while keeping the **same rule-based rank** inside each layer or across a **merged** pool.
- **Broader** matches (e.g. adjacent batch) **naturally sit lower** than tighter matches — no separate “you are now in mode B” unless copy briefly explains widening.
- **UI:** prefer a **single continuous result list** (or soft section labels), not hard step transitions.
- **API:** may still return a compact **`widening_summary`** or **`message_key`** describing *what* was relaxed — but not tied to a single global ladder.

**Empty results:** after widening to a defined maximum, show a **specific zero state** with suggestions — not generic “no results.”

### 2.4 Query normalization layer (upgrade from “aliases only”)

**Before** the main search runs, parse and normalize:

| Extract | Example |
|---------|---------|
| Batch year | `2019` from text or chips |
| Department | `mech` → Mechanical Engineering / dept id |
| Company | Known org name or **alias** → `organization_id` |
| Residual keyword | Remainder as `q` (or empty) |

**Example:** `"iit bhu mech 2019 google"` → `dept` = mechanical, `batch` = 2019, `company` → Google org match, **`q` = null** or leftover tokens only.

This layer subsumes **`search_aliases`** for common cases but also needs **dictionaries** (dept codes, org directory, job stopwords). **Illustrative alias rows** (still useful):

| Alias | Canonical |
|-------|-----------|
| ECE, CSE/CS, Mech/ME, Chem/CHE | Department names |
| B.Tech → BTech; Bangalore → Bengaluru; Bombay → Mumbai | Misc |
| HUL, TCS, … | Company → org |

---

## 3. Phase 1 — Intent, rules, completeness, diversity, logging, explanations

### 3.1 Query intent classification (lightweight)

Run **before** search (on normalized tokens + full string):

| Intent | Signals (heuristic) |
|--------|---------------------|
| **Looks like a name** | ~**2–3 tokens**; **capitalised** or title-case pattern; **no** strong job/topic words (“engineer”, “manager”, “consulting”, …). |
| **Looks like role / topic** | Contains **job/topic** vocabulary or generic professional terms. |
| **Looks like company** | Matches **known organisation** or **alias** (normalization layer). |

Intent **does not** replace filters; it **routes** which **§3.2** tier is emphasised and how aggressively to **widen**.

### 3.2 Rule-based ranking (Phase 1 — no weighted math)

**Order tiers (stable sort keys within each tier):**

1. **Exact name match** (normalised full name vs query) → **always top** among text matches.
2. **Title / headline role match** (current or primary occupation title) → **next**.
3. **Everything else** that still belongs in the widened pool → sort by **§3.3 completeness** (desc), then **`profile_completed_at`**, then **`id`**.

**Browse / no keyword:** skip tiers 1–2 where N/A; use tier 3 only + **§3.4**.

### 3.3 Completeness — decision usefulness (revised)

Align to **“can I understand what they do?”** and **relevance**, not checkbox counts.

| Signal | Weight band | Rationale |
|--------|-------------|-----------|
| **Clear role + company** (current headline occupation + org) | **High** | Answers “what they do” immediately. |
| **Bio with substantive text** (optionally keyword-relevant) | **Medium** | Context and searchability. |
| **Links, generic contact fields** | **Low** | Useful but noisy; **email should not boost much** (privacy + spam perception). |

Exact numeric points are **implementation detail**; keep **email** as **minimal or zero** boost in Phase 1.

### 3.4 Light diversity

Avoid a **biased** top of list (e.g. five people from the **same company** in the top five).

**Phase 1 (light):**

- **Cap** or **penalise repeats** of the same **organization** (and optionally **batch**) within the **top N** results (e.g. reorder with a greedy “fill slots” pass, or decay score for repeats — keep rules **simple**).

**Do not** over-engineer; **LinkedIn-style** heavy diversification is **out of scope** for Phase 1.

### 3.5 Analytics & feedback loop (log from day 1)

Even if unused for ranking initially, **persist:**

| Field | Purpose |
|-------|---------|
| Search **query** / normalized params | Replay and tuning |
| **Result positions** returned | Offline eval |
| **Clicks** (profile opens, CTAs) | Future learning-to-rank |

This is the **foundation** for post-Phase-1 improvement — **deterministic** ranking stays until you trust the data.

### 3.6 Match transparency (“why this result”)

Expose **subtle, factual** reasons (not a black box):

| Example copy driver | When |
|---------------------|------|
| “Matches your search: **product manager**” | Topic/title match |
| “**Same batch**” | Primary batch match |
| “Works at **Google**” | Company alignment |

Implement as **`matchReasons: string[]`** or structured codes + i18n on the client.

---

## 4. What NOT to rank on

Unchanged principle — do **not** use:

| Signal | Reason |
|--------|--------|
| Contact requests received | Rich-get-richer |
| Bulletin / post volume | Volume ≠ quality |
| Join date | Punishes late adopters |
| Raw department size | Skews discovery |

---

## 5. Later — weighted numeric scoring (Phase 2+)

The earlier **weighted blend** (`keyword_score × 0.60 + completeness × 0.25 + batch_proximity × 0.15`, field weights 1.0 / 0.7 / …) is **deferred** until after Phase 1 rules are stable and **analytics** exist to validate weights.

**Keyword field weights** and **PostgreSQL `ts_rank` / `setweight`** details apply in that phase, not Phase 1.

---

## 6. Current implementation vs this plan

| Area | Today | Target (Phase 1) |
|------|--------|------------------|
| Filters | **All AND** | **Primary strict**; **secondary boost** |
| Widening | None | **Progressive** pool + same rules |
| Ranking | Name alpha | **Exact name → title → completeness** |
| Intent | None | **Lightweight** §3.1 |
| Normalization | None | **Structured extract** + aliases §2.4 |
| Completeness in rank | N/A | **Usefulness-based** §3.3 |
| Diversity | None | **Light** §3.4 |
| Analytics | `search_log` coarse | **Query + positions + clicks** §3.5 |
| Explanations | None | **`matchReasons`** §3.6 |
| Preview / distribution | None | **Out of Phase 1** |

**Code touchpoints:** `apps/api/src/repos/discoveryRepo.ts`, `discoveryService.ts`, `discoveryRoutes.ts`, `apps/web/src/pages/Search.tsx`, new **normalization** module, **logging** tables or events.

---

## 7. Suggested implementation order

1. **Query normalization + intent** (§2.4, §3.1) — server-side.  
2. **Primary / secondary filter split** + **progressive widening** in SQL or service layer (§2.2–2.3).  
3. **Rule-based sort** (§3.2) + **completeness** (§3.3) + **diversity** pass (§3.4).  
4. **Analytics events** (§3.5).  
5. **`matchReasons`** in API + UI (§3.6).  
6. **URL + docs** single param set (§9).  
7. **Phase 2:** weighted scoring (§5), trigram name fallback, optional preview/distribution.

### 7.1 Backlog IDs (revised)

| ID | Feature | Phase |
|----|---------|--------|
| **S1-01** | Primary/secondary filters + widening | 1 |
| **S1-02** | Query normalization layer | 1 |
| **S1-03** | Intent classification | 1 |
| **S1-04** | Rule-based rank + completeness + diversity | 1 |
| **S1-05** | Analytics logging | 1 |
| **S1-06** | Match reasons on cards | 1 |
| **S1-07** | URL state + single param names | 1 |
| **S1-08** | ~~Preview~~ | **Deferred** |
| **S1-09** | Trigram / fuzzy name | 2 |
| **S1-10** | Discovery distribution | **Deferred** |
| **S1-11** | Weighted numeric scoring | 2+ |

---

## 8. Open decisions

- **Widening parameters:** How many **± years** for batch, and max **pool size** before zero state.
- **Strict employer (`company`) filter:** **Closed** — Refine / `company` query param is **always** a hard filter on occupation-linked org name (no separate “must match company” toggle).
- **Eligibility:** [`directory-search.md`](./directory-search.md) reflects current gates (no `is_searchable` on `people`).
- **Skills:** **Closed —** not collected; no plan to add as a profile or search field.
- **Personal email:** Confirm **directory-visible** rules before any contact field in completeness.

---

## 9. Client & API contract

### 9.1 Search result card

Same IA as before: **primary** identity (name, batch, dept) → **secondary** role + company → **tertiary** connect/badge; add **§3.6** reasons as optional chips or one line.

### 9.2 URL state (single scheme)

| Parameter | Example |
|-----------|---------|
| `q` | `?q=product+manager` |
| `batch` | `&batch=2019` |
| `dept` | `&dept=cse` |
| ~~`occ`~~ | *Paused* — replace with richer occupation params when designed |
| `company` | `&company=Acme` (org **name** substring **hard filter** when set; not id) |
| `cursor` | `&cursor=…` |

Residence (if kept): `residenceCountry`, `residenceCity` — document in [`directory-search.md`](./directory-search.md).

### 9.3 Input behaviour (Phase 1)

| Control | Behaviour |
|---------|------------|
| **Keyword field** | Debounced search against **main** `GET /v1/search` — **no separate preview endpoint** for now. |
| **Employer (`company`)** | When non-empty, **hard-filters** to profiles with a matching occupation-linked organization name (substring). |
| **Filter chips** | Immediate URL + refetch. |
| **Zero state** | Specific guidance; reflect **widening** if applied. |

### 9.4 Backend endpoints (Phase 1)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/v1/search` | Main search; optional **`widening_summary`** / **`message_key`**; optional **`matchReasons` per result**. |
| ~~`GET`~~ | ~~`/v1/search/preview`~~ | **Skipped** |
| ~~`GET`~~ | ~~`/v1/search/distribution`~~ | **Discovery — deferred** |

### 9.5 Repository mapping

**Shipped:** API and web use **`q`, `batch`, `dept`, `company`** (no legacy query keys). **`company`** is a **string** (org name substring) that **hard-filters** results when present, not a UUID. **`occ`** is **not** shipped until occupation filtering is expanded.

---

## 10. References

- [`directory-search.md`](./directory-search.md) — shipped API
- `apps/api/src/db/migrations/004_phase3_discovery.sql`, `008_directory_search_indexes.sql`
- `apps/web/src/pages/Search.tsx`
