# Demo Login & Guided Tour Runbook

This document describes the design, configuration, provisioning, and operational procedures for the safe shared demo login and guided tour feature (Issue #44).

---

## 1. Security Architecture & Invariants

1. **Strictly Independent Auth Path**:
   - `POST /v1/auth/demo-login` accepts `email` and `password`.
   - It runs completely separately from standard OTP, Google sign-in, and invite flows.
   - It **never modifies or touches allowlists** (domain, email, beta, or admin allowlists).
   - `AUTH_BYPASS` remains completely disabled in production.

2. **Credential Security**:
   - No plaintext passwords in code, migrations, client bundles, responses, or logs.
   - Verification uses timing-safe comparison (`crypto.timingSafeEqual`) with HMAC-SHA256 keyed on `AUTH_SECRET_PEPPER`.

3. **Explicit Non-Admin Demo Identity**:
   - Authenticated sessions set `isDemo: true` on the session actor and `/v1/me`.
   - Role is strictly forced to `"alumni"` (never admin or super-admin).

4. **Read-Only Enforcement**:
   - All mutation endpoints apply `app.requireNonDemoMutation`, returning `403` with code `DEMO_READ_ONLY`.
   - Protected mutations include: profile edits, occupation updates, links, connection messages, contact requests, and posts/replies.

5. **Strict Data Isolation**:
   - Discovery search and profile queries use `personIsDiscoverableForViewerSql(alias, viewerIsDemo)`.
   - When `viewerIsDemo = true`, queries scope strictly to synthetic demo alumni fixtures (`personIsDemoOnlyAlumniSql`).
   - Normal members continue to exclude all demo fixtures in production. Real member profiles are invisible to demo sessions.

6. **Brute Force & Abuse Controls**:
   - Multi-tier sliding rate limiting on `POST /v1/auth/demo-login`: per-IP, per-account, and global throttles.
   - Throttled requests return `429 Too Many Requests` with a compliant `Retry-After` header.

7. **Kill Switch & Invalidation**:
   - `DEMO_AUTH_ENABLED` defaults to `false`.
   - When set to `false`, new logins are rejected (`403 DEMO_AUTH_DISABLED`).
   - In addition, session resolution (`getActorFromSessionToken`) rejects existing demo sessions with `401 AUTH_UNAUTHORIZED`, instantly cutting off active demo sessions without affecting regular users.

---

## 2. Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `DEMO_AUTH_ENABLED` | boolean | `false` | Master kill switch for demo auth. |
| `DEMO_AUTH_EMAIL` | string | `""` | Dedicated institutional email for the demo account. |
| `DEMO_AUTH_PASSWORD_HASH` | string | `""` | SHA256 HMAC hash of the shared demo password keyed with `AUTH_SECRET_PEPPER`. |
| `DEMO_AUTH_MAX_PER_IP_WINDOW` | number | `30` | Max attempts allowed per IP within the rate-limit window. |
| `DEMO_AUTH_MAX_PER_ACCOUNT_WINDOW`| number | `60` | Max attempts allowed per demo account within the window. |
| `DEMO_AUTH_WINDOW_MINUTES` | number | `15` | Duration of the rate-limit window in minutes. |

---

## 3. Operational Runbook

### Generating a Password Hash
In `apps/api`:
```bash
AUTH_SECRET_PEPPER="<your-pepper>" npm run auth:hash-password -- "<chosen-password>"
```
Set the resulting hex string as `DEMO_AUTH_PASSWORD_HASH`.

### Provisioning the Demo Account
1. Ensure the demo account exists in the database `people` table with `role = 'alumni'` and `is_demo = TRUE`:
   ```sql
   INSERT INTO people (institutional_email, role, is_demo)
   VALUES ('demo@alumni.test', 'alumni', TRUE)
   ON CONFLICT (institutional_email) DO UPDATE SET is_demo = TRUE, role = 'alumni';
   ```
2. Ensure its associated profile is populated and has `onboarding_completed_at` set so it can immediately access `/home`.
3. Set `DEMO_AUTH_ENABLED=true` in deployment environment secrets.

### Seeding & Cleaning Demo Fixtures
- **Seed fixtures**:
  ```bash
  npm run seed:platform-mock
  ```
- **Clean fixtures**:
  ```bash
  npm run delete-demo-alumni
  ```
  *(Only targets demo email prefixes matching `personIsDemoAlumniSql`, never touches real alumni records).*

### Revoking Existing Demo Sessions (Credential Rotation)
When rotating `DEMO_AUTH_PASSWORD_HASH`:
1. Update `DEMO_AUTH_PASSWORD_HASH` with the new hash.
2. In the database or admin script, call:
   ```ts
   await sessionRepo.revokeAllByPersonId(demoPersonId);
   ```
   Or momentarily toggle `DEMO_AUTH_ENABLED=false` during restart.

---

## 4. Frontend Experience

1. **Dedicated Guided Tour Flow**:
   - The dedicated demo entry point, guided tour overlays, skip/replay controls, and disabled action explanations are integrated in the guided tour PR.
   - Any demo session resolves with `isDemo: true` on `/v1/me`.

2. **Navigation & Badges**:
   - Active demo sessions display a distinct `Demo Tour` badge and indicator in the navigation bar.
   - Profiles and search cards distinguish demo alumni records with the `Demo` badge.

