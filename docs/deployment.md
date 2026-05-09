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

Only one build-time variable (Vite):

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_URL` | Yes | API base URL, e.g. `https://api.yourdomain.com`. Requests go here; no proxy in production. |

Build: `cd apps/web && npm run build`. Deploy the `dist/` folder.

---

## 5. Deploy steps (summary)

**API**

1. Provision PostgreSQL; create DB and note `DATABASE_URL`.
2. Set all API env vars (see table above).
3. In `apps/api`: `npm install --omit=dev`, `npm run build`, `npm run migrate`, `npm run start` (or run `node dist/index.js` via process manager).
4. Expose the process on `PORT` (and put behind HTTPS / load balancer). Use `GET /healthz` for health checks.

**Web**

1. Set `VITE_API_URL` to your API URL.
2. In `apps/web`: `npm install --omit=dev`, `npm run build`.
3. Upload `dist/` to your static host or serve it (e.g. nginx, Vercel, Netlify).

**Post-deploy**

- Point DNS for API and app to the deployed hosts.
- If you use intentcasts: schedule `npm run job:intentcasts:expire` (e.g. daily cron) so expired intentcasts are closed.

---

## 6. Cookie / CORS and same-origin

- In **production**, API and web usually live on different origins (e.g. `api.yourdomain.com` and `app.yourdomain.com`).
- Set **CORS**: `CORS_ORIGIN` must include the exact web origin so the browser allows requests.
- Cookies are set by the API on its domain. For the web to send cookies to the API:
  - Either use **same-site cookies** and ensure the API sets `SameSite=None; Secure` if cross-origin (and that the frontend calls the API with `credentials: "include"` — already done).
  - Or put API and web under one domain (e.g. `app.yourdomain.com` and `app.yourdomain.com/api` with a reverse proxy) and set `COOKIE_DOMAIN=.yourdomain.com` so the cookie is sent to both.

---

## 7. Optional: Docker

No Dockerfile is in the repo yet. You can add:

- **API**: Dockerfile that installs deps, builds, runs `migrate`, then `node dist/index.js`. Pass env at runtime.
- **Web**: either build in CI and serve static files from nginx (or similar), or a multi-stage Dockerfile that runs `npm run build` and serves `dist/` with nginx.

---

## 8. Checklist before go-live

- [ ] `NODE_ENV=production` for API
- [ ] `CORS_ORIGIN` set to real frontend origin(s)
- [ ] `MAGIC_LINK_BASE_URL` set to frontend URL so magic links open the app
- [ ] `VITE_API_URL` set so the frontend calls the real API
- [ ] `EMAIL_PROVIDER=resend` and Resend keys set so sign-in emails are sent
- [ ] `AUTH_SECRET_PEPPER` strong and kept secret
- [ ] Migrations run on the production DB
- [ ] Health check: `GET /healthz` returns 200 when DB is up
- [ ] (Optional) Sentry and alerting; see [observability-checklist.md](observability-checklist.md)
