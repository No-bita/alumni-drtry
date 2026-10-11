# Test coverage map

What is tested, what is not, and why. Update this when a batch of tests lands.

## How to measure coverage

Coverage is not wired into the repo yet because `@vitest/coverage-v8` is not a dependency and adding it needs a lockfile update. To measure locally:

    cd apps/web
    npm i --no-save @vitest/coverage-v8@4.1.5
    npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.include='src/**'

To make it permanent: add `@vitest/coverage-v8` (same version as `vitest`) to `devDependencies` in `apps/web` and `apps/api`, commit the lockfiles, and add a `test:coverage` script.

## Web (apps/web), line coverage by area

Measured with batches 1 and 2 of the suite applied on top of main (113 tests).

| Area | Lines covered | Status |
| --- | --- | --- |
| src/lib | 57% (569 of 1000) | Good. Pure helpers are cheap to test and mostly covered. |
| src/constants | 28% | Mostly static data. Low value. |
| src/components | 4% | Gap. Needs component tests with a router, query client and auth mock. |
| src/pages | 0% | Gap. Same harness, plus API mocks per page. |
| src/hooks, src/contexts | 0% | Gap. Auth context needs a mocked `/v1/me`. |
| src/api | 13% | Client is thin. Covered indirectly once pages are tested. |

Still at 0% in src/lib and worth doing next: queryKeys, bulletinFlowBindings, reverseGeocodeClient, cityIntentFromToolbar. Barely covered and also worth doing: parseHiringBulletin (10%), bulletinPostCardUtils (21%), buildPostContent edge cases.

## Flows shipped as feature PRs, and where their tests live

These tests ship with the feature PRs because the code only exists on those branches.

| Flow | Tests |
| --- | --- |
| Cold start (API health alias, sign-in wording) | Covered by the manual check in the PR. API route test needs the DB-backed app, see below. |
| Personal footprint strip | homeFootprint.test.ts, homeFootprintStrip.test.tsx |
| Onboarding checklist | onboardingChecklist.test.tsx, plus edge cases in the stacked tests PR |
| Messaging refetch, no polling | threadRefresh.test.ts |
| Profile save preflight | profileSavePreflight.test.ts, plus ordering tests in the stacked tests PR |
| Empty feed defense | emptyFeedDefense.test.ts |
| Placeholder routes | devHubPages.test.ts |
| Campus updates | campusUpdatesPanel.test.tsx |
| City draft board | cityDraftCopy.test.ts |
| Invite batchmates | homeNetworkPanel.test.tsx, plus link tests in the stacked tests PR |

## API (apps/api)

Pure helpers in src/lib are tested without a database. Route and service tests (`tests/e2e.test.ts`, `tests/auth.test.ts`) need Postgres via `DATABASE_URL` and run slowly, one at a time.

Not covered, and why:
- src/services/* (auth, intentcast, discovery, connection threads, admin): need a database. They are exercised by the e2e suite, and `tests/auth.test.ts` also covers the database-backed `/v1/auth/start` route.
- src/routes/*: same. A mocked-repo layer does not exist, so route tests would need a test database.
- src/services/emailSender.ts: sends mail through a provider. Needs an injectable transport to test without side effects.
- src/lib/googleOAuth.ts, sentry.ts: wrap third-party SDKs.

## Cannot be tested here

- Real email delivery and OTP links: need a live provider.
- Google sign-in: needs live OAuth.
- Layout at 390px: covered by screenshots in the PRs, plus the CSS guard tests (mobileLayoutBreakpoints, landingMapLayoutGuard). Pixel layout is not asserted in jsdom.
- Render deploy health: needs the live service.
