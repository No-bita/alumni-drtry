# Production Readiness

| Item | Status | Notes |
|------|--------|------|
| **Error monitoring** | Done | Sentry wired — fires on unhandled errors only — silent in test |
| **Alerting** | Documented — pending config | Health check and error spike alerts need setting up in Sentry dashboard |
| **Log aggregation** | Documented — pending config | Pino JSON stdout ready — needs a log shipper in production environment |
| **Request tracing** | Deferred | Fine for MVP — revisit when you have multiple services |
| **Rate limiting** | Done | Verified working in tests |
| **Input validation** | Done | Fastify schema validation on all endpoints |
| **Session security** | Done | `Secure: true` and `SameSite: Strict` when `NODE_ENV=production`; relaxed in dev |
| **Secret management** | Done | All secrets in env vars — `.env.example` documents them |
| **CORS** | Pending | Lock to real frontend domain before beta |
| **Dependency audit** | Done | `npm audit` run — see below |
| **N+1 query check** | Done | Search endpoint uses 2 queries total — no N+1 |

---

## Session cookies (production)

Session cookies are set with:

- **`httpOnly: true`** — not accessible from JS (XSS).
- **`secure: true`** when `NODE_ENV === "production"` — sent only over HTTPS.
- **`sameSite: "strict"`** when `NODE_ENV === "production"` — not sent on cross-site requests (CSRF).
- In development, `sameSite: "lax"` and `secure: false` so local HTTP and magic-link redirects work.

Set in both `POST /v1/auth/verify` and `GET /v1/auth/verify` (magic-link callback).

---

## Dependency audit

Run before beta:

```bash
cd apps/api && npm audit
```

**Current (pre-beta):** 5 moderate issues, all in **devDependencies** (vitest → vite → esbuild). The advisory is for the dev server (website can send requests to dev server). **Production runtime is not affected.** Fix when possible with `npm audit fix` or by upgrading vitest when a non‑breaking fix is available. No high or critical vulnerabilities.

---

## Search endpoint N+1 check

**Flow for `GET /v1/search` (e.g. limit=20):**

1. **DiscoveryRepo.searchProfiles()** — **1 query**: single `SELECT` with JOINs on `people`, `departments`, `degrees`, and a `LATERAL` subquery that fetches the headline occupation per row in the same statement. No per-row follow-up queries.
2. **AdminMetricsService.logSearch()** — **1 query**: one `INSERT` into `search_log`.

**Total: 2 queries** regardless of result size. No N+1. Safe for production traffic.
