# Production shipping checklist

Use this before pointing real users at production. Items are grouped into **three buckets**: **A** is blocking for a safe launch (security, prod correctness, migrations, auth/email, health checks, canonical routing/CORS/cookies, data-loss risks). **B** is strongly recommended—verify before launch when practical, but not treated as hard gate for every team. **C** is polish and tech debt you can schedule after ship when builds and runtime behavior are already acceptable. Walk **A** completely; skim **B** for your risk tolerance; park **C** with owners and dates so it does not silently slip.

---

## Release run order (skim)

1. Pre-release: CI/build gates for API + Web (**A**); dependency posture and lint polish (**B** / **C**).
2. Configure API + Web env on hosts (`apps/api/src/config/env.ts`, `.env.example` files) — **A** details below.
3. Apply Postgres migrations on the production DB (`npm run migrate`; Railway **`preDeployCommand`** if applicable) — **A**.
4. Deploy API → verify **`GET /healthz`** — **A**.
5. Deploy Web with intended **`VITE_*`** flags — **A** (canonical: empty **`VITE_API_URL`** + [`apps/web/vercel.json`](../apps/web/vercel.json) rewrites; see [`deployment.md`](./deployment.md) §4).
6. Confirm intentcast expiry behavior (**A** minimum path; cron-only verification — **B**).
7. Run **post-deploy smoke** against production URLs — minimal path **A**, extended funnel **B**.
8. Confirm monitoring/alerts and document rollback stance — **B**.

---

## A. Must pass before launch

Blocking issues only: security, production env correctness, migrations on the prod DB, auth and email delivery, health checks, canonical Vercel→Railway **`/v1`** rewrite setup (empty **`VITE_API_URL`**, [`apps/web/vercel.json`](../apps/web/vercel.json)), cookies/CORS alignment, and data-loss risks.

### Pre-release verification

- [ ] API: `cd apps/api && npm test && npm run build` pass locally or in CI.
- [ ] Web: `cd apps/web && npm run build` passes locally or in CI (ship a bundle that compiles).
- [ ] No unintended prod DB access from dev laptops unless deliberate (see [`deployment.md`](./deployment.md) §3 “Local API using the production database”).

### Environment and secrets — API

Configure on the API host (e.g. Railway). Source of truth: `apps/api/src/config/env.ts`; template: `apps/api/.env.example`.

- [ ] **`NODE_ENV=production`** on the API process.
- [ ] **`PORT`** matches what the platform exposes (e.g. Railway injects **`PORT`**).
- [ ] **`DATABASE_URL`** production **Neon/Postgres** string with **`sslmode=require`** where applicable ([`neon-setup.md`](./neon-setup.md)).
- [ ] **`DATABASE_POOL_MAX`** (and optional **`DATABASE_POOL_*`** timeouts) sized for replica count and pooler (see `.env.example` comments).
- [ ] **`AUTH_SECRET_PEPPER`** ≥16 chars, random, **stable** — rotating invalidates hashes tied to it.
- [ ] **`AUTH_SECRET_PEPPER`** alongside mail credentials (**`RESEND_API_KEY`**, **`EMAIL_FROM`**, etc.) are production values—not dev placeholders.
- [ ] **`APP_BASE_URL`** is the public HTTPS API origin (no stray path segments).
- [ ] **`MAGIC_LINK_BASE_URL`**, if used, matches the exact HTTPS origin users open for the web app (magic-link redirects).
- [ ] **`AUTH_BYPASS_SUPER_ADMIN`** is **off** (blocked when **`NODE_ENV=production`** anyway); **`AUTH_BYPASS`** likewise **off**.
- [ ] **`SHOW_AUTH_SECRETS_IN_RESPONSE=false`** (or unset).
- [ ] **`CORS_ORIGIN`** lists real web origin(s); **not** **`*`** in production (**`credentials: true`** requires explicit origins; **`validateProductionCorsOrigin`** enforces this).
- [ ] **`COOKIE_DOMAIN`** set only when API + web share a parent domain and cross-subdomain cookies are intentional ([`deployment.md`](./deployment.md) §6 — cookies / CORS); otherwise leave unset until deliberate.
- [ ] **`EMAIL_PROVIDER=resend`** (or your provider); **`RESEND_API_KEY`**, **`EMAIL_FROM`** verified; DNS (**SPF/DKIM**) per provider; optional **`EMAIL_REPLY_TO`**, **`EMAIL_BRAND_NAME`**.
- [ ] **Google sign-in:** either **both** **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`** set, or **both** omitted; optional **`GOOGLE_OAUTH_HOSTED_DOMAIN`** (hostname only).
- [ ] **`ALLOWED_EMAIL_DOMAINS`** reflects institutional policy (default `iitbhu.ac.in,itbhu.ac.in`).
- [ ] **`ENABLE_PASSWORD_LOGIN=false`** in production unless you explicitly accept password login in prod.

### Environment — Web / Vite (canonical routing)

Template: `apps/web/.env.example`. Match repo reality: **canonical production** uses **empty** **`VITE_API_URL`** and same-origin **`/v1/*`** with Vercel rewrites to Railway ([`deployment.md`](./deployment.md) §4).

- [ ] **Canonical:** **`VITE_API_URL`** unset or empty; [`apps/web/vercel.json`](../apps/web/vercel.json) **`rewrites[].destination`** matches the **current** production API URL (`/v1/$1` proxy path).
- [ ] **If** the browser calls the API **directly** (non-canonical): **`VITE_API_URL`** is the API HTTPS origin **and** **`CORS_ORIGIN`** on the API includes the web origin.
- [ ] Beta invite UI: **`VITE_BETA_INVITE_AUTH_ENABLED=true`** on production builds that **should** expose invite-code login (aligned with API beta flags).

### Database

- [ ] Postgres **15+** (16/17 recommended per [`deployment.md`](./deployment.md)).
- [ ] **All migrations** applied on production **`DATABASE_URL`**: `cd apps/api && npm run migrate`. Railway: [`apps/api/railway.toml`](../apps/api/railway.toml) **`preDeployCommand`** — confirm it succeeded on the deploy you promote.
- [ ] Includes **`015_discovery_analytics.sql`** if directory analytics are used; **`016_contact_requests_sender_created_at_index.sql`** for contact-request rate-limit queries; verify **any newer migrations** in-tree before launch.
- [ ] **Backups** and restore process documented; Neon/Railway access scoped.

### Security and privileged accounts

- [ ] API is served **over HTTPS** so session cookies receive **`Secure`** (**`apps/api/src/routes/authRoutes.ts`** when **`NODE_ENV=production`**).
- [ ] Production session cookie **`SameSite`** stance documented ([Implementation reference](#implementation-reference) below).
- [ ] **TLS everywhere** for user-facing API and web.
- [ ] **Super admin:** migration **`007_super_admin.sql`** seeds an operator—confirm ownership, rotation, and that credentials never ship client-side.
- [ ] If **`DISCOVERY_ANALYTICS_ENABLED`**: **`discovery_search_sessions`** (and related) — retention and internal access meet policy.
- [ ] **Test users** (`is_test_user`, `e2e*` locals): run `scripts/delete-test-users.sql` or equivalent before broad launch if needed.

### Email and logs (sensitive payloads)

- [ ] Logs and APM do **not** capture **magic links, OTPs, session tokens**, or other high-sensitivity payloads.

### Background jobs — intentcast expiry (minimum viable behavior)

- [ ] **Either** the **default** production path: **`INTENTCAST_EXPIRY_SCHEDULER_MS`** unset → in-process expiry tick every **1 hour** after startup (`apps/api/src/index.ts`), **or** **`INTENTCAST_EXPIRY_SCHEDULER_MS=0`** with **`npm run job:intentcasts:expire`** scheduled on platform cron (see root [`README.md`](../README.md)) so expiry still runs. Do **not** ship with scheduler disabled **and** no cron.

### Deploy API

Target: Node **≥20.11** (`apps/api/package.json` **`engines`**).

- [ ] Build: **`npm ci && npm run build`** (matches [`railway.toml`](../apps/api/railway.toml) **`buildCommand`**).
- [ ] Start: **`npm run start`** → **`node dist/index.js`**.
- [ ] Health check wired to **`GET /healthz`** (Railway: **`healthcheckPath = "/healthz"`** in [`railway.toml`](../apps/api/railway.toml)).
- [ ] HTTPS termination in front of Node.

### Deploy Web

- [ ] **Vercel:** project **Root Directory** = **`apps/web`**; **`npm run build`**, output **`dist`**.
- [ ] [`apps/web/vercel.json`](../apps/web/vercel.json): SPA fallback + **`/v1`** proxy rules match **current** production API hostname.

### Post-deploy smoke (critical path)

Run against **production** URLs.

- [ ] **`curl -fsS https://<api-host>/healthz`** → **200** and JSON **`status`** / **`db`** ok ([`observability-checklist.md`](./observability-checklist.md)).
- [ ] Browser network tab: **`/v1/*`** hits expected host (same-origin rewrite vs direct API).
- [ ] Sign-in path you ship (OTP/magic link, Google, beta invite): no CORS errors; session cookie present.
- [ ] **`GET /v1/me`** returns expected profile when authenticated.

### Beta-specific (blocking when beta paths are enabled)

**API** (`apps/api/src/config/env.ts`):

- [ ] **`BETA_INVITE_AUTH_ENABLED`** — if **`true`**, **`BETA_SHARED_INVITE_CODE_HASH`** required (generate via **`npm run beta:hash-invite-code`** in **`apps/api`**).
- [ ] **`BETA_REQUIRE_ALLOWLIST`** — when **`true`**, intended emails exist in **`beta_allowed_emails`** (and admin allowlist flows you rely on).
- [ ] **`BETA_SHARED_INVITE_CODE_ID`** matches campaign if non-default.

**Web:**

- [ ] **`VITE_BETA_INVITE_AUTH_ENABLED=true`** on production builds that expose invite-code UX (must match API intent).

### Ownership — minimum release discipline

- [ ] **Deploy order** agreed: migrate DB → deploy API → deploy web (or atomic with Railway pre-deploy migrate).

---

## B. Nice to verify

Strongly recommended before launch; not strict blockers if you consciously accept residual risk.

### Dependency and lint posture

- [ ] API dependency posture reviewed: `cd apps/api && npm audit` (review findings; remediate or accept — see [Implementation reference](#implementation-reference)).
- [ ] Web: `cd apps/web && npm run lint` passes locally or in CI (if green is not yet enforced in CI, treat as **B**; see **C** if build passes without lint).

### Environment tuning — API

- [ ] **Session:** **`SESSION_COOKIE_NAME`**, **`SESSION_SLIDING_HOURS`**, **`SESSION_HARD_CAP_HOURS`**, **`SESSION_TOUCH_MIN_INTERVAL_SECONDS`** reviewed for UX ([Implementation reference](#implementation-reference)).
- [ ] **Rate limits:** **`AUTH_START_*`**, **`OTP_TTL_MINUTES`**, **`MAGIC_LINK_TTL_MINUTES`**, **`AUTH_CHALLENGE_MAX_ATTEMPTS`**, **`CONTACT_REQUEST_*`**, **`DISCOVERY_READ_*`**, **`BETA_INVITE_*`** reviewed vs traffic ([Abuse limits and scaling](#abuse-limits-and-scaling) below).
- [ ] **Discovery:** **`DISCOVERY_SEARCH_STATEMENT_TIMEOUT_MS`**, **`DISCOVERY_NORMALIZE_QUERY`**, **`DISCOVERY_ANALYTICS_ENABLED`** set intentionally.
- [ ] **`SENTRY_DSN`** set when using Sentry ([`observability-checklist.md`](./observability-checklist.md)).

### Abuse limits and scaling

- [ ] Tune **`CONTACT_REQUEST_MAX_PER_SENDER_WINDOW`**, **`CONTACT_REQUEST_WINDOW_MINUTES`**, **`DISCOVERY_READ_MAX_PER_USER_WINDOW`**, **`DISCOVERY_READ_WINDOW_MINUTES`**, and optionally **`DISCOVERY_READ_MAX_PER_IP_WINDOW`** for expected traffic (`apps/api/src/config/env.ts`, **`apps/api/.env.example`**).
- [ ] **Directory read limits are in-memory per API instance.** Multiple replicas ⇒ limits **per replica** unless you centralize (e.g. Redis). Raise caps or centralize before scaling out.

### Data and privacy

- [ ] Analytics/event retention aligned with policy when **`DISCOVERY_ANALYTICS_ENABLED`** is on.

### Background jobs — intentcast scheduling detail

- [ ] Confirm logs **`intentcast expiry tick`** when using the built-in scheduler.
- [ ] If **`INTENTCAST_EXPIRY_SCHEDULER_MS=0`**: cron runs **`npm run job:intentcasts:expire`** **at least daily** (see root [`README.md`](../README.md)).

### Post-deploy smoke (extended funnel)

- [ ] Directory: **search → profile → contact request** (minimal funnel you ship).
- [ ] Logout invalidates session (**`POST /v1/auth/logout`** / UI).

### Monitoring, logs, and rollback

- [ ] Sentry alerts for new issues / spikes ([`observability-checklist.md`](./observability-checklist.md)).
- [ ] Platform health checks alert when **`/healthz`** fails.
- [ ] Log aggregation captures API stdout (Pino JSON) without sensitive fields in pipelines ([`observability-checklist.md`](./observability-checklist.md)).
- [ ] Rollback: redeploy **previous known-good** API/Web artifacts documented; treat DB migrations as **forward-only** — vet on staging first.
- [ ] **`GET /healthz`** (or LB probe) wired with alerts beyond manual curl (dashboards / paging as appropriate).

### Beta-specific (product and QA)

**Product / analytics:**

- [ ] Cadence aligned with [`beta-analytics-launch.md`](./beta-analytics-launch.md).
- [ ] **`@vercel/analytics`** events visible for production domain if enabled.

**Invite QA:**

- [ ] Outcomes predictable when **`BETA_INVITE_AUTH_ENABLED`** varies: **`AUTH_INVITE_DISABLED`** vs **`AUTH_BETA_NOT_ALLOWED`** vs success.

### Ownership and operations

- [ ] **On-call / escalation** for API + database incidents documented internally.

---

## C. Can fix after launch

Polish and tech debt that does **not** block a safe ship once **A** is satisfied and runtime behavior is verified.

- [ ] Web **ESLint** fully green when **`npm run build`** already passes but lint is not CI-gated (chip away in follow-up PRs).
- [ ] **npm audit**: remediate or formally accept **non-critical** dependency findings after reviewing severity and exploitability (document exceptions).
- [ ] Doc-only tweaks (cross-links, runbook wording) that do not change runtime configuration.
- [ ] Staging/prod parity exercises beyond what you needed to validate **A** (extra fixtures, load tests, chaos drills)—schedule if not done pre-launch.

---

## Related docs

- [`deployment.md`](./deployment.md) — platform wiring, cookies, Node/Vercel/Railway; §8 short go-live list cross-links here for bucketed detail.
- [`observability-checklist.md`](./observability-checklist.md) — health checks, Sentry, logs.
- [`neon-setup.md`](./neon-setup.md) — database connection and SSL.
- [`directory-search.md`](./directory-search.md) — search contract and behavior.
- [`beta-analytics-launch.md`](./beta-analytics-launch.md) — beta usage analytics launch notes.

---

## Implementation reference

Technical notes folded in from the retired **`production-readiness`** doc. Session defaults **change over time** — confirm in **`apps/api/src/routes/authRoutes.ts`** (verify / cookie attach paths).

### Session cookies (production)

- **`httpOnly: true`** — not accessible from JS (XSS mitigation).
- **`secure: true`** when `NODE_ENV === "production"` — HTTPS only.
- **`sameSite: "strict"`** when `NODE_ENV === "production"` — not sent on cross-site navigations (CSRF stance).
- In development, **`sameSite: "lax"`** and **`secure: false`** so local HTTP and magic-link redirects work.

Cookies are set from **`POST /v1/auth/verify`** and **`GET /v1/auth/verify`** (magic-link callback).

### Dependency audit

Run periodically on the API tree:

```bash
cd apps/api && npm audit
```

Treat findings by severity and exploitability; remediate with **`npm audit fix`** / upgrades or document accepted risk (also tracked under bucket **C**).

### Directory search — query shape (no N+1)

For **`GET /v1/search`** (e.g. `limit=20`):

1. **`DiscoveryRepo.searchProfiles()`** — **one** `SELECT` with JOINs (including headline occupation via **`LATERAL`** in the same statement).
2. **`AdminMetricsService.logSearch()`** — **one** `INSERT` into **`search_log`**.

**Total: two queries** regardless of page size (see [`directory-search.md`](./directory-search.md) for contract, eligibility, indexes).

**Volume:** coarse signal via **`GET /v1/admin/metrics`** → **`searchVolume`**; add DB or APM latency if search becomes hot.
