# Security hardening

What protects member data, beyond "signed-in members only". Members see each other's public profile;
private details (emails, phone, WhatsApp number, notes, sessions) stay owner-only. These layers stop
outsiders and bulk copying.

## Database lock (migration 058)

- Row-level security is ON for every table in `public`, with **no policies** and no `FORCE`.
  - The API connects as the tables' owner, so it is unaffected (owners bypass row security).
  - Every other role sees zero rows and can't write. On Supabase that includes `anon` and
    `authenticated`, the roles behind its Data API (PostgREST), so the tables stay closed even if the
    Data API is switched on by mistake.
- Supabase's `anon` / `authenticated` also lose every table, sequence and function privilege in
  `public`, including for objects created later by the migration role.
- **Self-check:** the migration first confirms the role running it owns every table (or has
  BYPASSRLS). If not, it stops with an error naming the table, instead of locking the app out.
- **Keep the Supabase Data API switched off** (Project Settings → Data API). The lock is the second line.
- **New tables:** `tests/securityHardening.e2e.test.ts` fails if any table in `public` lacks row-level
  security, so a new migration must `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
- **Check in production:**
  `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE nspname='public' AND relkind IN ('r','p') AND NOT relrowsecurity;`
  should return nothing.

## Browsing limits (anti-scraping)

- **What counts:** "discovery reads" are directory search, profile reads, residence cities, Ask
  results, Careers company people, Cities pages and alumni lists, and the Wall feed.
- **Limits, counted per member in `discovery_read_counters`** (they survive restarts and are shared by
  every API instance; admins aren't counted):
  - **Burst:** `DISCOVERY_READ_MAX_PER_USER_WINDOW` per UTC minute (default 60) → `429 DISCOVERY_RATE_LIMITED`.
  - **Daily:** `DISCOVERY_READ_MAX_PER_USER_DAY` per day (default 500; the day starts at midnight
    Asia/Kolkata) → `429 DISCOVERY_DAILY_LIMIT`, "You've looked at a lot of profiles today. Try again
    tomorrow."
  - **Per client IP:** `DISCOVERY_READ_MAX_PER_IP_WINDOW` per minute (default 300), in memory.
- **Page sizes:** search 20, Wall feed 48, Careers company people 50, Cities alumni 20, Ask 5.
- **Watching for abuse:**
  - Admin → Analytics → "Browsing limits" shows how many members are at 80%+ of today's cap and at it
    (counts only).
  - The first request over the cap each day logs a warning to Sentry with the person id only.

## Requests, logs and errors

- **Client IP:** `TRUST_PROXY` (default: 2 hops in production) makes `request.ip` the real visitor IP
  behind Vercel and Render, so per-IP limits and session IPs aren't shared by everyone.
  - Limit: a client that calls Render directly can fake X-Forwarded-For. Only per-IP limits rely on
    it; the per-member limits don't.
- **Logs:**
  - A request log line has method, path (no query string), IP and request id: no headers, cookies or
    bodies.
  - Fields named email, institutionalEmail, personalEmail, token, magicLinkToken, otp and q are
    censored anywhere in a log object.
- **Sentry:**
  - It collects nothing about the request or person automatically (`dataCollection` all off), and
    every event is scrubbed: no query strings, cookies, headers or bodies; user id only.
- **Errors:**
  - The API error handler now applies to every route. It was registered after the route plugins, so
    Fastify's default handler had been answering instead, sending internal error text to clients and
    dropping `Retry-After` on 429s.
  - Unexpected errors return "Something went wrong."
- **Security headers:**
  - **API:** `nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none';
    frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and HSTS in production.
  - **Web** (`apps/web/vercel.json`): frame denial, `nosniff`, `strict-origin-when-cross-origin`, a
    Permissions-Policy (camera, mic, geolocation, payment and USB off) and HSTS.
  - **Web CSP, report-only first:** a Content-Security-Policy runs as `Report-Only` (browser console
    only). Once it shows no reports in normal use, rename the header to `Content-Security-Policy` to
    enforce it.

## Sign-in

- **POST verify:** the web verifies magic links with `POST /v1/auth/verify` (the token in the body).
- **GET verify (deprecated):** `GET /v1/auth/verify` still works for pages loaded before the switch, but
  its query string is never logged. Remove it after the next web deploy has been live for a week (old
  tabs reload; emailed links open the web page, which now uses POST).
- **Login CSRF:** both verify routes accept only requests from the app's own pages (allowed Origin or
  Referer, or `Sec-Fetch-Site: same-origin|same-site`; required in production), so another site can't
  sign a visitor into someone else's account.
- **Per-IP limit:** `AUTH_VERIFY_MAX_PER_IP_WINDOW` per 10 minutes (default 60).
- **Password login:** `ENABLE_PASSWORD_LOGIN` is refused in production.

## Other

- **WhatsApp:** website links (`/w/<code>`) last `WA_LINK_TOKEN_TTL_MINUTES` (default 60, was 24 hours).
  Expired links say "Text hi to the bot for a new one."
- **Wall:** deleted or suspended authors never appear, and other members' removed posts are hidden on
  the server. This was already true; the audit item was a false positive.
- **Test files** use placeholder emails, not real ones.

## Still open

- **Admin tiers** (creating admins, editing or deleting people → super-admin only) aren't built.
- **The analytics metadata allowlist** is on the unmerged `fix/analytics-audit` branch.
- **Only checkable in production:**
  - Supabase Data API off
  - the migration role owning the tables
  - Render's proxy hop count
  - log retention and access
  - Sentry project settings
