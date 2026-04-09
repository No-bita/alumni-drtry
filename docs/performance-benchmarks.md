# Performance benchmarks and iteration plan

This document defines the target performance state for the app and the process for iterating toward it. It is intended to be used as a release gate for regressions and a planning baseline for optimization work.

---

## 1) Target SLOs (ideal state)

Use production RUM p75 as the primary source of truth unless noted otherwise.

### Core Web Vitals

- **LCP:** under 2.0s (hard ceiling 2.5s)
- **INP:** under 150ms (hard ceiling 200ms)
- **CLS:** under 0.05 (hard ceiling 0.10)

### Request and response targets

- **TTFB (HTML/API):** under 500ms p75
- **Initial home fan-out:** at most 4 critical requests before meaningful paint
- **First visible shell on `/home`:** under 800ms on warm cache

### Frontend payload targets

- **Critical JS on initial home load:** under 200KB gzip
- **Home route immediate JS budget:** under 80KB gzip for route + required shared chunks
- **Main-thread long tasks during initial mount:** zero tasks over 50ms on target mobile profile

---

## 2) Test profile and measurement standards

### Primary lab profile

- Mid-tier Android equivalent
- CPU throttling enabled (mobile profile)
- 4G network throttling profile
- Cold-cache and warm-cache runs

### Primary environments

- **Production RUM:** source of truth for user experience
- **Staging lab runs:** pre-merge/CI regression checks

### Route coverage

- `/home` (primary)
- `/search`
- `/intent/career`

---

## 3) Performance budgets and release gates

Treat these as merge/release checks:

- If LCP/INP/CLS p75 breaches hard ceiling, block release unless explicitly waived.
- If critical JS budget exceeds threshold, fail CI budget check.
- If `/home` blocking request count exceeds target, open a performance debt task before shipping.
- If long tasks increase materially (relative baseline), require a mitigation note in PR.

---

## 4) Instrumentation stack

### RUM (production)

Track and dashboard:

- LCP, INP, CLS (p50/p75/p95)
- route-level breakdown (`/home`, `/search`, `/intent/career`)
- device/network segmentation (mobile vs desktop)

### Lab automation (CI)

- Lighthouse CI budgets for target routes
- Bundle-size budget check for critical route chunks
- Optional synthetic API latency checks for key home endpoints

Current scaffold entry points (web app):

- `apps/web/lighthouserc.json`
- `apps/web/scripts/check-performance-budgets.mjs`
- `apps/web/package.json` scripts: `perf:budget`, `perf:lighthouse`, `perf:ci`

Note: the default Lighthouse scaffold runs on public routes (`/`, `/login`) for deterministic CI. Auth-required routes such as `/home` should be tracked primarily via production RUM and optional authenticated lab runs.

### API observability

- p75 latency and error-rate per endpoint used on `/home`
- track fan-out count and endpoint contribution to start-render delay

---

## 5) Iteration workflow

Run this loop continuously:

1. Capture baseline metrics (RUM + lab).
2. Rank bottlenecks by user-impact (LCP blockers first).
3. Ship one focused optimization batch.
4. Re-measure and compare against baseline.
5. Keep/rollback based on measured delta.
6. Record outcome in changelog/perf notes.

Do not batch unrelated optimizations in a single measurement cycle; keep deltas attributable.

---

## 6) Milestones

### Milestone A

- Remove full-page blocking loaders on `/home`
- reduce blocking startup requests

### Milestone B

- Lazy-mount below-the-fold heavy sections
- defer expensive embeds/assets (for example, PDF viewer)

### Milestone C

- Enforce bundle budgets in CI
- add Lighthouse CI route budgets

### Milestone D

- Consolidate home startup data into fewer API calls where practical
- validate server and DB impact reduction

---

## 7) Ownership and cadence

- Review performance dashboard weekly.
- Re-baseline after major route or dependency changes.
- Include a short perf-impact note in every PR touching home/search/career routes.

---

## 8) Notes

- Optimize for user-perceived speed first (render path and interaction latency) before micro-optimizing internal code paths.
- Keep benchmarks stable long enough to compare trends; change targets only with explicit team agreement.
- Use `docs/performance-iteration-log-template.md` to record each optimization cycle and measured deltas.

