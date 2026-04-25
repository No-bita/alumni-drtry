# Decisions

## Keep Two Independent Apps

The repo keeps `apps/web` and `apps/api` as independent npm apps. There is no root workspace today, and adding one would introduce dependency and tooling churn without solving the current maintainability risks.

Consequence: run install, build, lint, and tests from each app directory.

## Preserve Route Service Repository On The API

The API already follows a useful route -> service -> repository flow. Refactors should tighten that boundary rather than force a new folder architecture.

- Routes parse and validate HTTP input.
- Services own business rules.
- Repositories own SQL and row mapping.

Consequence: add per-feature `*.types.ts` only when it reduces duplication or removes unsafe casts in touched code.

## No Demo Auth Bypass

Public demo mode is not intended to remain. The web app should not bypass auth, inject fake users, intercept API requests, or hide authenticated features based on a demo flag.

Consequence: all authenticated pages depend on the real session flow through `/v1/me` and `/v1/me/profile`.

## Prefer Real Contracts Over Mock Drift

The web app currently stores many response DTOs in `src/api/client.ts`. That is acceptable short-term, but transport behavior and DTO ownership should separate gradually as features are touched.

Consequence: do not create a generated OpenAPI pipeline or shared package until the contract surface is stable enough to justify it.

## Same Origin API Paths By Default

The browser should call relative `/v1/*` paths by default. Local development uses the Vite proxy; production uses hosting rewrites.

Consequence: changing deployment hosts must include verification of cookies, CORS, and session behavior.
