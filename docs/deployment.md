# Deployment Guide

What you need to deploy the IIT BHU Alumni Platform (API + Web).

---

## 1. What gets deployed

| App | What it is | Build / Run |
|-----|------------|-------------|
| **API** (`apps/api`) | Fastify REST API, Node 20+ | `npm run build` → `npm run start` (or `tsx src/index.ts` without build) |
| **Web** (`apps/web`) | React SPA (Vite) | `npm run build` → serve `dist/` (static files) |

You need **two deploy targets**: one for the API (Node process) and one for the web app (static hosting or SSR). Plus **PostgreSQL** for the API.

---

## 2. Infrastructure

- **PostgreSQL** (16 or 17 recommended; 15+ works): create a DB and run migrations from the API app.  
  **Neon**: see [Neon setup](neon-setup.md) for using Neon as the database (no code changes; set `DATABASE_URL` and run migrations).
- **API host**: any Node 20+ runtime (VM, Docker, Railway, Render, Fly.io, etc.). Must be reachable over HTTPS in production.
- **Web host**: static hosting (Vercel, Netlify, Cloudflare Pages, S3+CloudFront, etc.) or serve `dist/` from the same domain as the API (e.g. same server, different path).

**Canonical production web:** host the SPA on **Vercel** (`apps/web`). The repo’s `apps/web/vercel.json` rewrites `/v1/*` to the Railway API (`https://alumni-api-production.up.railway.app/v1/$1`), so the browser calls same-origin `/v1/...` and the edge proxies to the API.

---

## 3. API: environment variables (production)

Set these where the API runs (e.g. host env, `.env`, or platform config).

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | No | Default `4000` |
| `APP_BASE_URL` | Yes | Full API URL, e.g. `https://api.yourdomain.com` |
| `MAGIC_LINK_BASE_URL` | Yes (with frontend) | Frontend URL for magic links, e.g. `https://app.yourdomain.com` |
| `DATABASE_URL` | Yes | Postgres connection string |
| `AUTH_SECRET_PEPPER` | Yes | Long random secret (≥16 chars); never change after launch |
| `CORS_ORIGIN` | Yes | Frontend origin(s), e.g. `https://app.yourdomain.com` (comma-separated for multiple) |
| `COOKIE_DOMAIN` | Optional | e.g. `.yourdomain.com` if API and web share a parent domain and you want cookies to work across subdomains |
| `EMAIL_PROVIDER` | Yes (prod) | `resend` for real email |
| `RESEND_API_KEY` | If Resend | From Resend dashboard |
| `EMAIL_FROM` | If Resend | Verified sender, e.g. `noreply@yourdomain.com` |
| `EMAIL_REPLY_TO` | Optional | Reply-to address |
| `SENTRY_DSN` | Optional | For error monitoring (see [observability-checklist.md](observability-checklist.md)) |

Copy from `apps/api/.env.example` and fill production values. Run **migrations** once before first start: `npm run migrate` (uses `DATABASE_URL`).

### Local API using the production database

To run `npm run dev` in `apps/api` against the **same** Postgres instance as production:

1. Set `DATABASE_URL` in `apps/api/.env` to the production connection string (from Neon or Railway). Use a **public** reachable host from your machine (e.g. Neon pooler, or Railway `DATABASE_PUBLIC_URL`), not an internal Railway hostname.
2. Set `AUTH_SECRET_PEPPER` to the **exact** production value. The database stores hashes derived from this pepper; a mismatch breaks logins and sessions.
3. Keep `DATABASE_POOL_MAX` low (e.g. `5`) so local dev does not open too many connections against the shared cluster.
4. Set `CORS_ORIGIN` and `MAGIC_LINK_BASE_URL` to your local web origin (e.g. `http://localhost:5173`) while testing from Vite.

**Risk:** local scripts, bugs, or `npm run migrate` can alter production data. Prefer a database backup or a staging clone unless the whole team intentionally shares one DB.

---

## 4. Web: environment variables (production)

Vite exposes optional build-time variables via `VITE_*`.

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_URL` | **No** (canonical) | Leave **unset or empty** for the default production path: the SPA calls relative `/v1/...`, and Vercel rewrites those requests to Railway (see `apps/web/vercel.json`). |

Build: `cd apps/web && npm run build`. Deploy the `dist/` folder.

### Deployment modes for the web ↔ API boundary

**(A) Canonical — same-origin `/v1` via Vercel (default)**  
Leave `VITE_API_URL` empty. The browser only talks to your SPA origin; paths under `/v1` are rewritten server-side to the Railway API. Cookies stay first-party from the browser’s perspective, and you avoid cross-origin fetches for API traffic. Still set `CORS_ORIGIN` on the API to your real frontend origin(s); the upstream API continues to validate `Origin` as usual.

**(B) Optional — browser calls the API host directly**  
Use this when you are **not** terminating `/v1` on the SPA host (no rewrite). Point `VITE_API_URL` at the full API origin at build time (e.g. `https://api.yourdomain.com`) **and** configure the API’s `CORS_ORIGIN` to match your deployed web origin, per the root README production checklist. Expect stricter cookie rules when the API is on a different site than the SPA unless you align domains (`COOKIE_DOMAIN`, HTTPS, `SameSite=None; Secure`, etc.).

**Note:** The bundled client resolves production API requests to same-origin `/v1` by default (`apps/web/src/api/client.ts`). If you rely on a separate API origin without rewrites, ensure your build actually emits requests to that base (for example by adjusting how `API_BASE_URL` is derived for production) so `VITE_API_URL` takes effect.

---

## 5. Deploy steps (summary)

**API**

1. Provision PostgreSQL; create DB and note `DATABASE_URL`.
2. Set all API env vars (see table above).
3. In `apps/api`: `npm install --omit=dev`, `npm run build`, `npm run migrate`, `npm run start` (or run `node dist/index.js` via process manager).
4. Expose the process on `PORT` (and put behind HTTPS / load balancer). Use `GET /healthz` for health checks.

**Web**

1. Deploy `apps/web` on **Vercel** (or another static host). For the canonical setup, commit **`apps/web/vercel.json`**, which rewrites `/v1/*` → `https://alumni-api-production.up.railway.app/v1/$1` (change the destination when your Railway URL changes).
2. Leave **`VITE_API_URL` empty** so production builds use relative `/v1` behind that rewrite. If you use mode (B) instead, set `VITE_API_URL` at build time and align API `CORS_ORIGIN` with your web origin (see §4).
3. In `apps/web`: `npm install --omit=dev`, `npm run build`.
4. Vercel serves `dist/` automatically from the linked project; other hosts upload `dist/` or serve it behind nginx, Netlify, etc.

**Post-deploy**

- Point DNS for API and app to the deployed hosts.
- If you use intentcasts: schedule `npm run job:intentcasts:expire` (e.g. daily cron) so expired intentcasts are closed.

---

## 6. Cookie / CORS and same-origin

- **Canonical Vercel setup:** the browser issues same-origin requests to `https://<your-app>/v1/...`; Vercel proxies them to Railway. Configure **`CORS_ORIGIN`** on the API for your SPA’s public URL anyway so preflight and origin checks match how you deploy.
- **Split-origin setups** (direct API host from the browser): API and web live on different sites (e.g. `api.yourdomain.com` vs `app.yourdomain.com`). Set **`CORS_ORIGIN`** to the exact web origin(s). Cookies are scoped to the API host unless you share a parent domain (`COOKIE_DOMAIN`) and HTTPS/`SameSite` align with your hosting choices.
- For cross-site API calls, the API typically sets `SameSite=None; Secure` where needed; the frontend already uses `credentials: "include"` where applicable.

---

## 7. Optional: Docker

No Dockerfile is in the repo yet. You can add:

- **API**: Dockerfile that installs deps, builds, runs `migrate`, then `node dist/index.js`. Pass env at runtime.
- **Web**: either build in CI and serve static files from nginx (or similar), or a multi-stage Dockerfile that runs `npm run build` and serves `dist/` with nginx.

---

## 8. Checklist before go-live

For the full **bucketed** pre-launch list (must-pass vs nice-to-have vs post-launch), see [`production-shipping-checklist.md`](production-shipping-checklist.md).

- [ ] `NODE_ENV=production` for API
- [ ] `CORS_ORIGIN` set to real frontend origin(s)
- [ ] `MAGIC_LINK_BASE_URL` set to frontend URL so magic links open the app
- [ ] Web: **`VITE_API_URL` left empty** (canonical Vercel rewrite to Railway) **or**, if using direct API calls, **`VITE_API_URL`** set at build with API **`CORS_ORIGIN`** matching the web origin (see §4)
- [ ] Web: **`vercel.json`** rewrites `/v1/*` to the live Railway API URL (or equivalent proxy in front of static hosting)
- [ ] `EMAIL_PROVIDER=resend` and Resend keys set so sign-in emails are sent
- [ ] `AUTH_SECRET_PEPPER` strong and kept secret
- [ ] Migrations run on the production DB
- [ ] Health check: `GET /healthz` returns 200 when DB is up
- [ ] (Optional) Sentry and alerting; see [observability-checklist.md](observability-checklist.md)
