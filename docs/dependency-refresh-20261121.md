# Dependency refresh, 21 November 2026

Prepared from main `43c45c8`. This is an unmerged local upgrade, not a production rollout.

## Scope

Updated the reviewed API, web and landing direct dependencies to registry latest where supported, refreshed their lockfiles, and made small compiler/lint compatibility changes. No hosted runtime, database schema, console setting or feature change is included. The two parked City pagination/filter findings are unchanged.

Key versions:

- Landing: Next.js and eslint-config-next 16.4.6, React/React DOM 19.3.1, Framer Motion 14.14.0, Vercel OIDC 4.0.9, Tailwind 4.3.5.
- API: Sentry 11.16.0, dotenv 18.0.10, pg 8.23.1, Fastify 5.12.8, Vitest 5.1.1.
- Web: Vite 8.3.8, plugin-react 6.3.0, Vitest 5.1.1, jsdom 31.0.1, React Query 5.108.2, Router 7.18.6, ESLint 10.15.0, typescript-eslint 8.73.0, Lighthouse CI 0.16.1.

## Explicit compatibility exceptions

- Web and landing use TypeScript 6.0.3. Registry latest 7.0.2 is outside typescript-eslint 8.73.0's supported `>=4.8.4 <6.1.0` range. API retains its existing TypeScript 7.0.2, with a passing build.
- Landing uses ESLint 9.39.5. eslint-config-next 16.4.6 includes eslint-plugin-react 7.37.5, whose peer range does not include ESLint 10. ESLint 9 is marked unsupported upstream. This remains a known maintenance exception for review, not a claim of full latest-version compliance. Web uses ESLint 10.
- Node type definitions are aligned to latest 24.x, 24.19.2, rather than latest 26.x, to avoid exposing APIs absent from the documented hosted runtime major. Actual hosted runtime versions were not queried or changed.
- jsdom 31 requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; LHCI 0.16.1 requires Node >=22.19. Local checks used Node 22.23.5. CI's floating Node 22 line satisfies this when current. The documented Render 24.14.1 is below jsdom's test-only floor; API production does not depend on jsdom. A machine running the web tests on Node 24 must be at least 24.15.0. Hosted build/runtime configuration needs separate verification before rollout.

## Compatibility changes

- Removed the active deprecated web `baseUrl` setting, preserving it in a comment. The relative department-catalog alias is unchanged.
- Landing test compilation now uses Node16 module resolution instead of deprecated node10 and declares plain CSS imports. OIDC pin assertions were updated, not removed.
- ESLint 10 redundant initializer findings were addressed without changing the resulting values. The structured-link parser already exits via `break` on no progress; its redundant assignment is preserved in a comment.
- Announcement batch-year memoization now has simple stable dependencies.
- Four narrow React Hooks rule exceptions document existing URL synchronization and async event-handler behavior. No rule is disabled globally, and no broader login/search feature change is intended.

## Security dependency evidence

All three refreshed lockfiles report zero vulnerabilities from `npm audit` as checked during this work. This is registry-advisory evidence, not proof that no vulnerability exists.

The actual web lock contains `@puppeteer/browsers` 3.2.7, `puppeteer-core` 25.18.1, `chromium-bidi` 157.0.8090-0, zod 4.6.7 and basic-ftp 6.2.6. `extract-zip` is absent. Puppeteer itself is still present through Lighthouse. Landing's transitive typescript-eslint/parser family was refreshed to 8.73.0 rather than leaving the vulnerable old resolution under the new Next manifest.

## Checks completed locally

- Web: 746 tests, lint, TypeScript and production build passed.
- API: build passed. All migrations through 068 and all 556 tests passed on a newly created isolated local PostgreSQL 18.7 database. The first no-database test attempt failed because localhost:5432 had no server; the full isolated-database rerun passed with none skipped.
- Landing: lint, production build and 90 tests passed. Tests were compiled and run directly, avoiding the existing test script's deletion of old output.
- All three dependency trees pass `npm ls --all`; no forced peer resolution or legacy-peer-deps flag was used in the final installs.
- Local landing and login pages were inspected at 420px and 1440px. No page JavaScript errors or horizontal overflow were observed. External/API requests were blocked, so the login screenshot intentionally shows Google sign-in unavailable; no authentication or production-data check is claimed.
- The upgraded LHCI collection command completed one desktop login audit locally, without upload or production requests. This is a tool smoke check, not a full performance certification.

The existing performance-budget script still expects `dist/assets` and an obsolete BulletinPanel chunk, while the current build emits `dist/app/assets`. It fails on its existing path assumption. No unrelated repair was included.

## Sources

Version and peer/engine metadata were read from the owning npm registry on 21 November 2026, including https://registry.npmjs.org/next/latest, https://registry.npmjs.org/typescript-eslint/latest, https://registry.npmjs.org/eslint-config-next/latest, https://registry.npmjs.org/eslint-plugin-react/latest, https://registry.npmjs.org/jsdom/latest and https://registry.npmjs.org/%40lhci%2fcli/latest. Exact installed resolutions are in the committed lockfiles.
