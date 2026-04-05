# Web app optimizations (`apps/web`)

For **cost-focused** reduction of API/DB traffic (deduping, sampling, backend writes), see `[cost-and-request-optimizations.md](./cost-and-request-optimizations.md)`.

This document lists **possible** optimizations for the IIT BHU Alumni **Vite + React 19 + React Router** frontend. Items are grounded in the current codebase so you can prioritize by impact, effort, and risk.

**Principles used:** measure first; keep the default bundle small; avoid duplicate work; fail fast and recover gracefully; prefer platform APIs (`fetch`, built-in debouncing patterns) over heavy libraries unless a clear need appears; maintainability beats micro-optimizations.

---

## Status at a glance

| Area | Largely done | Still open / partial |
| ---- | ------------- | --------------------- |
| **Bundles** | Route-level `React.lazy` + `Suspense`; manual vendor chunks in `vite.config.ts`; deferred font CSS + deferred Vercel Analytics | Occasional tree-shaking audit when dependencies grow |
| **Network** | Shared auth session query (`/v1/me` + `/v1/me/profile`); `api.get` + `AbortController` on major effects; directory search uses `useInfiniteQuery` with `signal` on **`/search`** and **`LocationPage`** | Wider TanStack Query coverage for one-off `api.get` screens; conditional JSON parse in `client.ts`; `signal` on `api.post`/`patch`/`delete` if long-running mutations need cancel |
| **Rendering** | **`/search`** virtualizes rows with `@tanstack/react-virtual` | **`LocationPage`** (`/intent/location`) still maps all loaded results in a grid—virtualize or cap if “load more” grows large; optional `React.memo` on `SearchResultRow` / cards |
| **Fonts** | **@fontsource** self-host: DM Sans on critical path; Playfair + Cormorant scheduled after `load` + idle (`scheduleNonCriticalAssets.ts`) | Fine-tune subset weights if bundle size matters; ensure `font-display` behavior matches design (variable fonts already packaged) |
| **Auth UX** | Session data shared via context; TanStack Query keeps prior data while refetching (no global `loading` flash on **refetch** once hydrated) | First visit still shows `RequireAuth` loading until initial session query settles—optional placeholder / skeleton polish |
| **Ops / quality** | TypeScript + ESLint | Bundle visualizer in CI; Lighthouse / Playwright perf budgets; CSP; source maps policy |

---

## 1. Bundle size and JavaScript delivery


| Idea                           | Status   | Why                                                                                  | Notes for this repo                                                                                                                                                                                                                                  |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route-based code splitting** | **Done** | Users who only hit `/login` should not download `/home`, `/search`, onboarding, etc. | `App.tsx` uses `React.lazy` + `<Suspense>` (one async chunk per page). `Login.tsx` prefetches the **Home** chunk after correct OTP (success video) so `/home` is warm when navigation runs.                                                            |
| **Vendor chunk strategy**      | **Done** | Better caching when app code changes but React does not.                             | `vite.config.ts`: `vendor-react`, `vendor-router`, `vendor-tanstack`, `vendor-fonts`, `vendor-analytics`, `vendor-misc`.                                                                                                                              |
| **Defer non-critical JS**      | **Done** | Faster Time to Interactive.                                                          | Playfair + Cormorant font CSS loads after `load` + `requestIdleCallback` (`scheduleNonCriticalFontCss` in `lib/scheduleNonCriticalAssets.ts`). DM Sans stays on the critical path (`main.tsx`). Vercel Analytics loads after `load`, then idle (`DeferredVercelAnalytics.tsx`). |
| **Tree-shaking audit**         | Open     | Dead code still ships if imports are wrong.                                          | Dependency surface is small (`react`, `react-router-dom`, `@tanstack/*`, `@vercel/analytics`, `@fontsource/*`). Re-audit if you add UI kits or icons-as-packages.                                                                                    |


---

## 2. Network and data layer


| Idea                                          | Status    | Why                                                    | Notes for this repo                                                                                                                                                                                                                                             |
| --------------------------------------------- | --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deduplicate `/v1/me` and `/v1/me/profile`** | **Done**  | Fewer round-trips, less backend load.                  | `AuthProvider` loads both in one TanStack Query (`AUTH_SESSION_QUERY_KEY` + `fetchAuthSession` in `authSessionQuery.ts`). `ProfileGate`, `Home`, onboarding, etc. read `auth.myProfile` / `auth.person` from context.                                              |
| **Client cache / SWR**                        | Partial   | Consistent data, less flicker, stale-while-revalidate. | **In use:** auth session (`AuthContext.tsx`), directory **`Search`** + **`LocationPage`** (`useInfiniteQuery`), top cities on **`LocationPage`** (`useQuery`). **Opportunity:** adopt the same pattern for other repeated reads (e.g. thread detail, notifications) where it reduces duplicate fetches and simplifies invalidation. |
| **Abort in-flight requests**                  | **Done**  | Avoid race conditions and wasted bandwidth.            | `api.get` accepts `ApiGetInit` (`signal` / `headers`). Major data effects use `AbortController` + cleanup (`Home`, `Profile`, `Onboarding`, `Landing`, `Nav`, `BulletinPanel`, threads/inbox/notifications, `CareerPage`, `AuthVerify`, infinite queries). Check `res.aborted` after `await` where needed. |
| **Conditional JSON parsing**                  | Open      | Small savings on non-JSON errors.                      | `client.ts` always `res.json()`. For 204 or unexpected bodies, a `content-type` check avoids parse noise.                                                                                                                                                        |
| **HTTP caching headers**                      | Open      | CDN/browser reuse for static assets.                   | Ensure deployment (e.g. Vercel) sets long-cache hashes for `dist/assets/*`. API responses stay `no-store` for personalized routes.                                                                                                                              |


---

## 3. Rendering and UI performance


| Idea                                | Status   | Why                                                      | Notes for this repo                                                                                                                                                                                                                            |
| ----------------------------------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualize long directory lists** | Partial  | DOM size grows with result count.                        | **`Search.tsx`:** **Done** — `@tanstack/react-virtual` + `useVirtualizer`. **`LocationPage.tsx`:** still renders `results.map` in a grid; “Load more” can grow DOM—mirror search virtualization or cap pages if this route gets heavy traffic.   |
| **Memoize list items**              | Open     | Avoid re-rendering every card when parent state changes. | `SearchResultRow` / `SearchResultCard` are plain components; wrap in `React.memo` if profiling shows unnecessary rerenders; stabilize callback props from parents.                                                                              |
| **Stable keys & list patterns**     | **Done** | Correct reconciliation.                                  | Using stable ids (e.g. `profile.id`) in search/location lists.                                                                                                                                                                                 |
| **Reduce layout thrash**            | Open     | Smoother scroll and paint.                               | Low-cost experiment: `content-visibility: auto` on long card sections (mind scroll margins).                                                                                                                                                   |


---

## 4. Fonts and images


| Idea                            | Status   | Why                                          | Notes for this repo                                                                                                                                                                                                   |
| ------------------------------- | -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Font loading strategy**       | **Done** | Third-party CSS blocks or delays text paint. | **Not Google Fonts `<link>`:** fonts ship via **@fontsource** packages. DM Sans imported in `main.tsx`; display/accent fonts deferred in `scheduleNonCriticalFontCss`. Further win: trim unused weights if bundle size becomes an issue. |
| **Preconnect to API origin**    | Open     | Faster first API call in production.         | When `VITE_API_URL` points to another origin, add `<link rel="preconnect" href="…">` (build-time or env-driven). `index.html` is minimal today—good place to inject it.                                              |
| **Responsive images**           | Open     | Less bytes on mobile.                        | `constants/images.ts` uses Unsplash with fixed `w=`. Consider `srcset`/`sizes` or **WebP/AVIF** in `public/` for LCP heroes.                                                                                           |
| **loading="lazy" / decoding**   | Open     | Defer offscreen image work.                  | Apply to `<img>` tags where relevant (`decoding="async"`).                                                                                                                                                            |


---

## 5. CSS and design tokens


| Idea                        | Status | Why                                      | Notes for this repo                                                                                                                                                                              |
| --------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CSS size**                | Open   | Parse/apply cost scales with sheet size. | `index.css` pulls `tokens`, `base`, `components`. As features grow, split **page-level** CSS or scoped patterns so unused rules do not dominate (no Tailwind purge—manual discipline).              |
| **Critical CSS (optional)** | Open   | Faster first paint.                      | Usually unnecessary at current scale; revisit if LCP is CSS-blocked.                                                                                                                              |


---

## 6. Auth and gating UX


| Idea                                    | Status  | Why                       | Notes for this repo                                                                                                                          |
| --------------------------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Avoid double loading waterfalls**     | Partial | Perceived speed.          | **Improved:** session + profile load once via auth query; gates consume context. **Remaining:** first paint still waits on initial `useQuery` (`RequireAuth` loading)—optional skeletons or optimistic shell. |
| **Refetch without global loading flash** | **Done** (typical) | Smoother session refresh. | With TanStack `useQuery`, **`isPending`** is for “no data yet.” After the first successful fetch, **`refetch()`** does not flip the context to `loading`—previous `person` / profile stay visible while revalidating. |


---

## 7. Build, quality, and operations


| Idea                                        | Status | Why                                                        | Notes for this repo                                                                      |
| ------------------------------------------- | ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Bundle analyzer**                         | Open   | Visualize what ships.                                      | `rollup-plugin-visualizer` or `vite-bundle-visualizer` locally or in CI before releases. |
| **Lighthouse CI / Playwright perf budgets** | Open   | Regression guardrails.                                     | Track LCP, TBT, CLS on `/`, `/home`, `/search` against a staging API.                    |
| **Source maps policy**                      | Open   | Debuggability vs. exposure.                                | Upload maps to error tracker only; disable public maps in production if policy requires. |
| **Strict TypeScript + ESLint**              | **Done** | Prevents perf footguns (accidental imports, dead exports). | In place; some `react-hooks` rules may need tuning as async patterns grow.               |


---

## 8. Security and robustness (engineering quality)

These items support **reliability** and safe performance under attack or overload:

- **Content-Security-Policy** appropriate for font CDN (if any), Unsplash, and your API origin — **not fully documented in repo**; define when deployment hardens.
- **Rate-limit sensitive client actions** in UI (disable buttons, backoff) aligned with API `429` / `Retry-After` (patterns exist on auth flows; extend where relevant).
- **Input validation** mirrored client-side for UX only; never rely on it for security (backend remains source of truth).

---

## 9. Suggested prioritization (what to do next)

Earlier roadmap items **route splitting**, **session dedupe**, **AbortController on major GETs**, **deferred analytics**, and **`/search` virtualization** are **done** (see tables above). Suggested **next** work, by impact vs effort:

1. **`LocationPage` list scaling** — Reuse the same virtualized list approach as `Search.tsx` (or enforce a max accumulated page count) so `/intent/location` stays bounded as users load many pages.
2. **Conditional JSON in `client.ts`** — Small robustness win on empty or non-JSON error bodies.
3. **API `preconnect` in `index.html`** — Quick win when production API is on a separate origin (`VITE_API_URL`).
4. **Broader TanStack Query** — Migrate high-churn reads (notifications list, thread detail) if duplicate loads show up in Network panel or UX feels jumpy.
5. **Fonts / images polish** — Subset weights; `srcset` or static WebP for hero imagery if LCP regresses.
6. **Bundle analyzer + Lighthouse CI** — Guardrails before the app grows.
7. **`React.memo` on directory rows** — Only after measuring; avoid premature optimization.

**Lower urgency (already addressed elsewhere):** itemized “TanStack Query when more screens share resources” is partially satisfied; “Analytics deferred load” is already implemented.

---

## 10. What is already in good shape

- **Small dependency graph** — no large UI framework beyond React.
- **Vite** — fast dev server; hashed assets + manual vendor chunks for cache friendliness.
- **Debounced / committed search** — directory keyword churn limited (`Search.tsx` / URL commit patterns; `useDebouncedValue` where used).
- **Pagination (“Load more”)** — directory API uses cursors + page size limits.
- **Home data path** — occupations + batch snapshot share one `AbortSignal`; profile/person from auth session query.
- **Aborted GETs** — `fetch` cancelled via `signal`; handlers respect `aborted` on `api.get` results where races matter.

---

*Last updated to reflect `apps/web` as of **2026-04-04**. Revisit after major feature additions or dependency changes.*
