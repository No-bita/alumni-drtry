# Alma Mater staging environment

Staging is a second, private copy of Alma Mater for testing changes before they
reach real users. The production app keeps running untouched. PR preview
deployments are NOT staging: they still proxy `/v1` to the production API, so
testing on a preview can change real alumni data.

## Architecture

| Piece | Production | Staging |
| --- | --- | --- |
| Website | Vercel project `alumni-drtry`, main branch | `staging` branch deployment on the same Vercel project |
| API | Render service `alma-mater-api` | New free web service in a SEPARATE Render workspace |
| Database | Supabase project `alma-mater` | New free Supabase project in the `Moonshots` org |
| Data | Real alumni | Synthetic users only; never a production copy |

A separate Render workspace gives staging its own 750 free instance-hours per
month so testing can never consume production's allowance. A separate Supabase
project keeps test data out of the live database (free orgs allow 2 active
projects; verified Moonshots had room for one more on 28 Oct 2026).

## Open decisions (Aaryan to confirm before setup completes)

1. **Test sign-in via restricted server logs.** With `EMAIL_PROVIDER=console`
   no real email is sent; the sign-in link is written to the staging API's
   Render logs. Anyone opening that link signs in, so treat it like a
   password: never paste it into chat, docs or tickets. Recommended for the
   initial setup.
2. **Vercel preview protection scope.** Restricting the staging site with
   Vercel Authentication on the existing project also restricts every other
   PR preview on that project to his Vercel account (Hobby = owner only).
   Production custom domains stay public under Standard Protection. The
   staging API remains publicly addressable either way, so its own auth and
   rate limits still matter.

## Staging API environment (Render dashboard, staging service)

Set these explicitly. Do not copy production values.

| Variable | Staging value | Why |
| --- | --- | --- |
| `DATABASE_URL` | New staging Supabase connection string | Isolation. Never the production URL. |
| `AUTH_SECRET_PEPPER` | NEW random 16+ char value | Fresh DB; reusing the production pepper is only for sharing the production DB. |
| `INTENTCAST_EXPIRY_SCHEDULER_MS` | `0` | Runs HOURLY by default when `NODE_ENV=production`; unset is not off. |
| `CONTACT_REQUEST_REMINDER_SCHEDULER_MS` | `0` | Same hourly default trap. |
| `EMAIL_PROVIDER` | `console` | No real email; link goes to restricted logs (decision 1). |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | Only required when provider is `resend`. |
| `WHATSAPP_ENABLED` | `false` | Default; leave all `WA_*` unset so no real messages can send. |
| `SENTRY_DSN` | unset | Keeps external error reporting off. |
| `CORS_ORIGIN` | Staging website URL | Browser access from the staging site only. |
| `MAGIC_LINK_BASE_URL` | Staging website URL | Sign-in links open the staging site. |
| `APP_BASE_URL` | Staging API URL | Self-reference. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Separate STAGING OAuth client | Both or neither; never the production client. Add the staging callback URL in Google Cloud console. |
| `GOOGLE_OAUTH_HOSTED_DOMAIN` | `itbhu.ac.in` | Same restriction as production. |
| `BETA_INVITE_AUTH_ENABLED` | `false` | Same as production default. |

Analytics flags stay at defaults: events write into the staging database,
which is the isolation the plan wants.

## Website routing

- `apps/web/vercel.json` on main rewrites `/v1/*` to the production API. That
  line must never change on main.
- The `staging` branch carries the same file with the destination swapped to
  the staging API URL (see `staging-vercel.patch` beside this doc). Apply it
  only on the staging branch.
- `scripts/check-web-api-target.mjs` runs as the `api-target-guard` job in CI
  on pull requests into main and pushes to main, and fails if `/v1` points
  anywhere except the production API. Pull requests into the `staging` branch
  are not gated, so staging feature work is never blocked by its own routing.
  If the production API host ever changes, update the constant in the guard in
  the same PR.

## Console setup order (Aaryan clicks; Instinct guides)

1. Supabase: confirm no staging project already exists in `Moonshots` and
   that a free slot is available.
2. Supabase: create project `alma-mater-staging`, region Singapore, free
   plan. Save the database password via the Instinct vault link, never in
   chat.
3. Render: create a new workspace `alma-staging` (free).
4. After the staging branch is published: create a web service in that
   workspace from the `staging` branch, free instance type, and set the
   environment table above (secrets via vault links).
5. Apply database migrations to the STAGING database only, then seed
   synthetic users. No production copy, no resets, no deletions.
6. Vercel: enable protection per decision 2.
7. Google Cloud: create the staging OAuth client with the staging callback
   URL.

## Isolation verification (before any functional testing)

- Staging API logs show the staging database host, never production.
- Staging website's `/v1` responses come from the staging API.
- No real email or WhatsApp message can be sent (provider is console / off).
- Both schedulers are off: no expiry or reminder ticks in staging logs.
- No writes to production analytics.

## Release gate

1. Change passes CI and CodeRabbit review on its PR.
2. The same version is deployed to staging and tested end to end with
   synthetic users (email-link sign-in, Google sign-in, sessions, discovery,
   notes, sign-out).
3. Aaryan approves promotion. Main deploys production as today. There is no
   automatic staging-to-production promotion.

## Cost

Designed for current free tiers: Render free instances sleep after 15 idle
minutes (30-60s cold start) and each workspace gets 750 free instance-hours
per calendar month; Supabase free projects pause after inactivity. No paid
plan, no payment details without explicit approval.
