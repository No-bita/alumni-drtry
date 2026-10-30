# Alma Mater staging environment

Staging is a second, private copy of Alma Mater for testing changes before they
reach real users. The production app keeps running untouched. PR preview
deployments are NOT staging: they still proxy `/v1` to the production API, so
testing on a preview can change real alumni data.

## Environment split

| Piece | Production | Staging |
| --- | --- | --- |
| Website | Vercel project `alumni-drtry`, main branch | `staging` branch deployment on the same Vercel project |
| API | Render service `alma-mater-api` | Separate free web service in a separate Render workspace |
| Database | Supabase project `alma-mater` | Separate free Supabase project |
| Data | Real alumni | Synthetic users only; never a production copy |

Separate workspaces and projects keep staging's usage and data away from
production's allowances and records.

## Safety rules

- Never copy production data into staging. Synthetic users only.
- Never reuse production secrets or the production database URL. Staging gets
  fresh credentials, collected through vault links, never in chat.
- Staging must not contact real users or outside services: email stays in
  console/log mode, WhatsApp messaging and external error reporting stay off.
- Background schedulers that run in production are explicitly turned off in
  staging.
- Apply database migrations and seed data to the staging database only.
- Before functional testing, verify the staging site and API talk only to
  staging resources and can send nothing to real users.
- Exact setup values (connection strings, environment settings, vendor
  limits) live outside this doc and are provided step by step during setup.

## Open decisions (Aaryan to confirm before setup completes)

1. **Test sign-in via restricted server logs.** With console email, the
   sign-in link appears in the staging API's logs and anyone opening it signs
   in. Treat it like a password: never paste it into chat, docs or tickets.
2. **Vercel preview protection scope.** Restricting the staging site on the
   existing Vercel project can also restrict other PR previews on that
   project. The staging API remains publicly addressable either way, so its
   own auth and rate limits still matter.

## Website routing

- `apps/web/vercel.json` on main rewrites `/v1/*` to the production API. That
  must never change on main.
- The `staging` branch carries the same file with the destination swapped to
  the staging API URL (see `staging-vercel.patch` beside this doc). Apply it
  only on the staging branch.
- `scripts/check-web-api-target.mjs` runs as the `api-target-guard` CI job on
  pull requests into main and pushes to main, and fails whenever `/v1`
  traffic could reach anything except the production API - including when a
  catch-all rewrite placed before the `/v1` rule would shadow it. Pull
  requests into the `staging` branch are not gated, so staging feature work
  is never blocked by its own routing. If the production API host ever
  changes, update the constant in the guard in the same PR.

## Release flow

1. A change passes CI and CodeRabbit review on its PR.
2. The same version is deployed to staging and tested end to end with
   synthetic users.
3. Aaryan approves promotion. Main deploys production as today. There is no
   automatic staging-to-production promotion.

## Cost

Designed for current free tiers, with the expectation that free services
sleep or pause when idle. No paid plan and no payment details without
explicit approval.
