# Production shipping checklist

Use this before pointing real users at production. It complements the status table in [`production-readiness.md`](./production-readiness.md).

---

## Environment and secrets

- [ ] **`NODE_ENV=production`** on the API process.
- [ ] **`AUTH_SECRET_PEPPER`**, **`DATABASE_URL`**, and mail credentials (**`RESEND_API_KEY`**, **`EMAIL_FROM`**, etc.) are production values—not dev defaults or placeholders.
- [ ] **`AUTH_BYPASS_SUPER_ADMIN`** is **off** in production (the schema rejects enabling it when `NODE_ENV=production`).
- [ ] **`SHOW_AUTH_SECRETS_IN_RESPONSE=false`** (or unset).
- [ ] **`CORS_ORIGIN`** lists your real web origin(s). Do **not** use `*` in production; the API uses **`credentials: true`**, which requires an explicit origin list.
- [ ] **`APP_BASE_URL`** and, if used, **`MAGIC_LINK_BASE_URL`** match the URLs users actually open (HTTPS, correct host/path for magic links).

---

## Database

- [ ] **All migrations** have been applied on the production database, including analytics (**`015_discovery_analytics.sql`**) if you use directory analytics, and **`016_contact_requests_sender_created_at_index.sql`** for contact-request rate-limit queries.
- [ ] **Backups** and restore process are defined; access to the Neon (or Postgres) project is limited.

---

## Security and privileged accounts

- [ ] API is served **over HTTPS** so session cookies receive **`Secure`** (see `apps/api/src/routes/authRoutes.ts` when `NODE_ENV=production`).
- [ ] **`COOKIE_DOMAIN`** is set only if the web app and API share a parent domain and you intentionally need a scoped cookie; otherwise leave unset until you understand the implications.
- [ ] **Super admin** identity: migration **`007_super_admin.sql`** seeds an operator—confirm who owns that account, how it is rotated, and that it is not exposed in client-side code.

---

## Abuse limits and scaling

- [ ] Tune **`CONTACT_REQUEST_MAX_PER_SENDER_WINDOW`**, **`CONTACT_REQUEST_WINDOW_MINUTES`**, **`DISCOVERY_READ_MAX_PER_USER_WINDOW`**, **`DISCOVERY_READ_WINDOW_MINUTES`**, and optionally **`DISCOVERY_READ_MAX_PER_IP_WINDOW`** for expected traffic (see `apps/api/src/config/env.ts` and `apps/api/.env.example`).
- [ ] Remember: **directory read limits are in-memory per API instance**. With multiple replicas, effective limits are **per replica** unless you add a shared store (e.g. Redis). Plan to raise caps or centralize if you scale out.

---

## Data and privacy

- [ ] If **`DISCOVERY_ANALYTICS_ENABLED`** is on, **`discovery_search_sessions`** and related click data are stored—decide **retention**, internal access, and whether this meets your policy.
- [ ] **Test users** (`is_test_user`, `e2e*` locals): run `scripts/delete-test-users.sql` or equivalent before public launch if needed.

---

## Email and observability

- [ ] **`EMAIL_PROVIDER=resend`** (or your real provider) in production; verify DNS (**SPF/DKIM**) per provider docs.
- [ ] **`SENTRY_DSN`** (or equivalent) is set if you want error monitoring.
- [ ] Logs and APM do not capture **magic links, OTPs, session tokens**, or other high-sensitivity payloads.

---

## Web client

- [ ] Frontend env points the API client at the **production API** base URL (your `VITE_*` or equivalent pattern).
- [ ] Smoke test on the real domain: **sign-in → session → `/v1/me` → directory search → profile → contact request** (and any flows you ship).

---

## Operations

- [ ] **Deploy order** documented (e.g. run DB migrations, then deploy API, then web).
- [ ] **`GET /healthz`** (or your load balancer health check) is wired and alerts if the API or DB is unhealthy.
- [ ] On-call or escalation path for API/database incidents.

---

## Related docs

- [`production-readiness.md`](./production-readiness.md) — session cookies, CORS note, audits, search query shape.
- [`neon-setup.md`](./neon-setup.md) — database connection and SSL.
- [`directory-search.md`](./directory-search.md) — search contract and behavior.
