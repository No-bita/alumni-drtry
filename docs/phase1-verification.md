# Phase 1 Verification Checklist

Last updated: March 8, 2026

## Summary

Phase 1 is code-complete.
Runtime verification is still pending in an environment with Node.js + PostgreSQL.

## Requirement Check

| Task | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Domain allowlist for `@iitbhu.ac.in` and `@itbhu.ac.in` | Pass | `apps/api/src/lib/domainAllowlist.ts`, `apps/api/src/services/authService.ts`, `apps/api/tests/domainAllowlist.test.ts` |
| 2 | Email parser for department and joining year | Pass | `apps/api/src/lib/emailParser.ts`, `apps/api/tests/emailParser.test.ts` |
| 3 | OTP/magic link auth via institutional email | Pass (code) | `apps/api/src/routes/authRoutes.ts`, `apps/api/src/services/authService.ts`, `apps/api/src/services/emailSender.ts` |
| 4 | Person record creation on first verified login | Pass | `apps/api/src/services/authService.ts`, `apps/api/src/repos/personRepo.ts`, `apps/api/src/db/migrations/001_phase1.sql` |
| 5 | Secure session management | Pass (code) | `apps/api/src/repos/sessionRepo.ts`, `apps/api/src/routes/authRoutes.ts`, `apps/api/src/app.ts`, `apps/api/src/db/migrations/001_phase1.sql` |

## What Was Missing And Fixed

1. Real institutional email delivery:
   - Added `EMAIL_PROVIDER=resend` support with Resend API.
   - Kept `console` provider for local development.
2. Delivery failure handling:
   - Auth challenge is deleted if email send fails.
   - API returns `503 AUTH_DELIVERY_FAILED` instead of leaving stale challenge rows.
3. Secure default for debug secrets:
   - `.env.example` now sets `SHOW_AUTH_SECRETS_IN_RESPONSE=false`.

## Pending Runtime Validation

The following commands still need to be run in a Node-enabled environment:

1. `npm install`
2. `npm run migrate`
3. `npm test`
4. `npm run dev`
5. Manual flow check:
   - `POST /v1/auth/start`
   - `POST /v1/auth/verify` (OTP or magic link)
   - `GET /v1/me`
   - `POST /v1/auth/logout`

## Completion Decision

Phase 1 should be treated as complete after the runtime validation above passes.
