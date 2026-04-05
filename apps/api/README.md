# Alumni API (Phase 1-3 in progress)

This service now covers Phase 1, Phase 2, and core Phase 3 features of the alumni platform MVP:

1. Domain allowlist (`@iitbhu.ac.in`, `@itbhu.ac.in`)
2. Email parser (department + joining year extraction)
3. OTP + magic-link verification flow
4. Person record creation on first verified login
5. Session management with secure HTTP-only cookie

## Setup

1. Copy `.env.example` to `.env` and set values.
2. Install dependencies: `npm install`
3. Run DB migrations: `npm run migrate`
4. Start API: `npm run dev`

## Email Delivery

- `EMAIL_PROVIDER=console` logs OTP and magic-link details to stdout (local/dev).
- `EMAIL_PROVIDER=resend` sends real email via Resend.
- When using Resend, set:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
  - optional `EMAIL_REPLY_TO`

## Endpoints

- `POST /v1/auth/start`
- `POST /v1/auth/verify`
- `GET /v1/auth/verify` (magic-link click)
- `POST /v1/auth/logout`
- `GET /v1/me`
- `GET /v1/me/profile`
- `PATCH /v1/me/profile`
- `GET /v1/me/occupations`
- `POST /v1/me/occupations`
- `PATCH /v1/me/occupations/:id`
- `DELETE /v1/me/occupations/:id`
- `GET /v1/me/links`
- `POST /v1/me/links`
- `PATCH /v1/me/links/:id`
- `DELETE /v1/me/links/:id`
- `GET /v1/search`
- `POST /v1/discovery/analytics/profile-click`
- `GET /v1/profiles/:id`
- `POST /v1/intentcasts`
- `GET /v1/intentcasts`
- `GET /v1/intentcasts/:id` (single card when visible to viewer)
- `PATCH /v1/intentcasts/:id/close`
- `POST /v1/intentcasts/:id/respond`
- `GET /v1/intentcasts/:id/responses`
- `GET /v1/notifications/summary`
- `GET /v1/notifications`
- `POST /v1/contact-requests`
- `PATCH /v1/contact-requests/:id`
- `POST /v1/orgs/suggest`
- `GET /v1/admin/orgs/pending`
- `PATCH /v1/admin/orgs/:id`
- `DELETE /v1/admin/orgs/:id`
- `GET /v1/admin/people/:id`
- `PATCH /v1/admin/people/:id`
- `DELETE /v1/admin/people/:id`
- `GET /v1/admin/people/duplicates`
- `GET /v1/admin/metrics`
- `GET /healthz`

## Security Defaults

- Challenges are single-use and attempt-limited.
- OTP and magic-link tokens are stored hashed.
- Session token is opaque and stored hashed.
- Session cookie is HTTP-only and same-site (`Lax`).
- Start-auth requests are rate-limited by email and IP.
- `POST /v1/contact-requests` is capped per sender over a rolling DB window (`CONTACT_REQUEST_*` env).
- Directory reads (`GET /v1/search`, `GET /v1/profiles/:id`, `GET /v1/directory/residence-cities`) share an in-memory per-user (and optional per-IP) cap (`DISCOVERY_READ_*` env); use Redis or similar if you run many API replicas.
- If email delivery fails, the auth challenge is deleted and `503 AUTH_DELIVERY_FAILED` is returned.

## Profile Update (Phase 2)

`PATCH /v1/me/profile` currently supports:

- `fullName`
- `departmentCode`
- `batchYear`
- `degreeCode` (`null` clears value)
- `personalEmail` (`null` clears value)
- `bio` (`null` clears value)
- `mobilePhone` (`null` clears value; max 40 chars)
- `residenceCountry` / `residenceCity` (`null` clears value)
- `markMinimumProfileComplete` (`true` only) — sets **`profile_completed_at`** when a non-empty name is on file (end of onboarding step 2).
- `markOnboardingComplete` (`true` only) — sets **`onboarding_completed_at`** after minimum profile exists (end of onboarding step 3).

**Timestamps:**

- **`profile_completed_at`** — directory minimum; unlocks search in the web app when `profileCompletedAt` is set.
- **`onboarding_completed_at`** — full funnel done (ideal); used for onboarding routing and home “% complete”.

There is **no** `is_searchable` column on `people` after migration `012_remove_is_searchable.sql`.

## Discovery (Phase 3)

`GET /v1/search` — full detail: **`docs/directory-search.md`**.

**Query parameters:**

- `batch` (strict, graduating `batch_year` only), `dept` (strict), `company` (strict: occupation-linked org name substring), `occ` (soft ranking hint), `q`, optional `residenceCountry` / `residenceCity`
- `limit` (default 20, max 100), `cursor` (v3; widening state encoded when batch was widened ±1)

See **`docs/directory-search.md`**.

**Env (optional):**

- `DISCOVERY_NORMALIZE_QUERY` — parse `q` for year / dept / known org aliases (default `false`).
- `DISCOVERY_ANALYTICS_ENABLED` — write search sessions + accept profile-click events (default `true`; requires migration **`015_discovery_analytics.sql`**).

**`POST /v1/discovery/analytics/profile-click`** — JSON body includes `searchSessionId`, `profileId`, `position` (and optional fields); ties clicks to the viewer’s session row.

**Behavior notes (today):**

- Results **never include** the signed-in viewer’s own profile (`excludePersonId`).
- Rows require **not deleted**, **not suspended**, and **non-null `full_name`** (see `docs/directory-search.md`).
- Ordering is **rule-based** (not plain alphabetical); primary filters are strict where applicable; `occ` boosts ranking only.

`GET /v1/profiles/:id` returns:

- public profile fields
- occupations
- links

## Contact (Phase 3)

- Intentcast expires in 7 days by default.
- Manual close endpoint: `PATCH /v1/intentcasts/:id/close`
- Expiry job script: `npm run job:intentcasts:expire`
- Single bulletin card (deep link / notifications): `GET /v1/intentcasts/:id` — author always sees own post; others use the same visibility rules as the feed.
- Intentcast responses are private to intentcast author:
  - create: `POST /v1/intentcasts/:id/respond`
  - view (author only): `GET /v1/intentcasts/:id/responses`

Contact requests:

- in-app activity feed (signed-in): `GET /v1/notifications` — pending incoming connection requests, outcomes for requests you sent, and replies to bulletin posts you authored
- notification count (signed-in): `GET /v1/notifications/summary` — `{ count }` for badges (same sources as the feed; cheap aggregate)
- inbox (pending, you are recipient): `GET /v1/contact-requests/inbox`
- compose: `POST /v1/contact-requests`
- recipient decision: `PATCH /v1/contact-requests/:id` with `action=accept|decline`
- response body includes `notificationDelivered` when creating or responding (email may fail while the DB update still succeeds).
- notification emails:
  - note received → recipient institutional email (failure is logged; the `contact_requests` row is **kept** and the API still returns **201**)
  - accept/decline → sender institutional email (failure does not roll back accept/decline; `notificationDelivered` is false)
