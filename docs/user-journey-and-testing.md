# User journey, test cases, and edge cases

This document describes how people move through the **IIT BHU Alumni** web app as implemented today (`apps/web`), including **routing**, **profile gating**, **onboarding eligibility**, and **suggested QA coverage**.

**Onboarding eligibility is not calendar-based:** there is no 7-day or 30-day account-age rule. Eligibility uses **`appLoginCount`** (successful OTP/magic-link verifications) as described below—see `shouldUseOnboardingFlow` in `apps/web/src/lib/onboardingEligibility.ts` and `people.app_login_count` on the API.

---

## 1. Roles and concepts


| Concept                     | Meaning                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session**                 | Cookie-based auth after magic link / OTP verification; `GET /v1/me` returns `{ person }`.                                                                                                                                                                                             |
| **Profile completion**      | `profile.profileCompletedAt` is set (server marks completion when criteria are met).                                                                                                                                                                                                  |
| **“New” user (onboarding)** | Incomplete profile **and** `profile.appLoginCount` **≤ 2** (incremented on each successful OTP/magic-link verify; `shouldUseOnboardingFlow`).                                                                                                                                         |
| **“Returning” incomplete**  | Incomplete profile **and** `appLoginCount` **> 2** → **no** `/onboarding` funnel; directed to **`/home`**.                                                                                                                                                                            |
| **Super admin**             | `person.role === "super_admin"`. Follows the same profile gate and onboarding journey as alumni, in every build. |


---

## 2. Primary user journeys

### 2.1 Anonymous visitor

1. Lands on `**/`** (marketing).
2. Can open **Sign in** → `**/login`**.
3. Any **unknown path** (`*`) redirects to `**/home`**; unauthenticated users then hit `**RequireAuth`** and are sent to `**/login**` (replace navigation).

**Intent:** Marketing and sign-in entry only; no directory data without auth.

---

### 2.2 Sign-in (institutional email)

1. `**/login`**: enter institutional email → `**POST /v1/auth/start`** (challenge created; rate limits possible).
2. User completes verification via:
  - **OTP** (`POST /v1/auth/verify` with code), and/or  
  - **Magic link** → `**/auth/verify?challengeId=…&magicLinkToken=…`** → `**GET /v1/auth/verify`**
3. Client calls `**refetch()**` (session), then `**GET /v1/me**` and `**GET /v1/me/profile**` to decide where to go next.

**Post-auth routing (alumni, not super admin):**


| Condition                                                                   | Destination   |
| --------------------------------------------------------------------------- | ------------- |
| `profile` missing                                                           | `/home`       |
| `profileCompletedAt` set                                                    | `/home`       |
| Incomplete **and** `shouldUseOnboardingFlow(profile)` (`appLoginCount` ≤ 2) | `/onboarding` |
| Incomplete **and** **not** onboarding-eligible (`appLoginCount` > 2)        | `/home`       |


**Super admin:** same routing table as alumni above.

---

### 2.3 First-time (new) incomplete user — onboarding

1. Routed to `**/onboarding`** (step query `?step=0…5`).
2. **Gate on load:** `GET /v1/me/profile` + occupations; if no profile, completed profile, or **not** eligible for onboarding flow → `**Navigate` to `/home`**. Fetch failure → redirect home (`.catch`).
3. **Step 0:** Welcome screen (first-time design); **Let’s begin** → step 1+.
4. Later steps: confirm details, name, occupation, links/bio, done — persisting via `**PATCH /v1/me/profile`**, `**POST /v1/me/occupations`**, etc. (as implemented in `Onboarding.tsx`).
5. Completion step → user can go to `**/home**`.

**Intent:** Only **onboarding-eligible** incomplete accounts (first two successful logins) use the dedicated funnel; **returning** incomplete users are **not** kept on `/onboarding` if they deep-link there.

---

### 2.4 Returning incomplete user

1. After login or landing redirect: `**/home`** (not `/onboarding`).
2. `**/search`** and `**/profiles/:id**`: `**ProfileGate` `mode="directory"**` sends them to `**/home**` if the profile is incomplete (and they are not super admin).
3. They still see **home** affordances (e.g. profile strength, prompts) per `Home.tsx`.

**Intent:** Re-engagement on home, not the “first-time” wizard.

---

### 2.5 Profile-complete alumni

1. `**/home`**: dashboard — profile summary, search entry, batch snapshot, suggestions, intentcasts feed, responses, etc. (data from `/v1/me`, `/v1/me/profile`, `/v1/me/occupations`, `/v1/intentcasts`, `/v1/search`).
2. `**/search`**: directory search with filters; pagination/cursor as implemented.
3. `**/profiles/:id**`: public profile view; **contact request** via `**POST /v1/contact-requests`** (and related flows).
4. **Sign out:** `**POST /v1/auth/logout`** → session cleared → typically `**/`** from Nav.

---

## 3. Route and guard matrix


| Path                       | Auth     | Profile / rules                                                                                                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Optional | Signed-in users redirected to `/home` or `/onboarding` / `/home` per profile.                                                      |
| `/login`                   | No       | Completes session then redirects like post-auth table above.                                                                                               |
| `/auth/verify`             | No*      | *Session established during verify; then same redirect logic as login.                                                                                     |
| `/home`                    | Required | **ProfileGate `home`:** complete **or** returning incomplete → render; **onboarding-eligible** incomplete → redirect `/onboarding`.     |
| `/onboarding`              | Required | Internal gate: only “onboarding-eligible” incomplete users stay; else → `/home`.                                                                           |
| `/search`, `/profiles/:id` | Required | **ProfileGate `directory`:** complete → render; **onboarding-eligible** incomplete → `/onboarding`; **returning** incomplete → `/home`. |
| `*`                        | —        | **Navigate to `/home*`* (then auth/profile as above).                                                                                                      |


---

## 4. Suggested test cases (functional)

### 4.1 Auth

- Valid email → challenge created → OTP path completes session and lands in expected route (see §2.2).
- Magic link with valid `challengeId` + `magicLinkToken` → success → same routing as OTP.
- Magic link missing params → error UI; link to `/login`.
- Invalid/expired token → error state on `/auth/verify`.
- Rate limit on `/v1/auth/start` → user sees message and retry hint (`AUTH_RATE_LIMITED`).
- Sign out from Nav → session cleared; access to `/home` redirects to `/login`.

### 4.2 Landing (`/`)

- Anonymous → marketing + Sign in.
- Authenticated super admin → redirect `/home`.
- Authenticated + profile load error → error UI with refresh/sign-in options (see `Landing.tsx`).
- Authenticated + complete profile → `/home`.
- Authenticated + incomplete + `appLoginCount` ≤ 2 → `/onboarding`.
- Authenticated + incomplete + returning → `/home`.

### 4.3 Profile gate

- **Directory:** incomplete **new** user navigates to `/search` → redirected to `/onboarding`.
- **Directory:** incomplete **returning** user → redirected to `/home`.
- **Directory:** complete user → `Search` renders.
- **Home:** incomplete **new** user → redirected to `/onboarding`.
- **Home:** incomplete **returning** user → `Home` renders.
- **Super admin** follows the same gate as alumni: failed or missing profile → “Couldn’t load your profile”; incomplete → same redirects as alumni.
- Profile fetch fails in gate → “Couldn’t load your profile” with recovery path.

### 4.4 Onboarding

- Eligible user: step 0 welcome → step 1+; data persists (PATCH profile, occupations, etc.).
- Ineligible user opens `/onboarding` directly → redirected to `/home`.
- Completed profile opens `/onboarding` → redirected to `/home`.
- API failure on initial load → redirect `/home` (current behavior).

### 4.5 Core product (post-completion)

- Home loads intentcasts and search-derived sections without unhandled errors.
- Search: query + filters; results link to `/profiles/:id`.
- Profile page loads another user; contact request success and error paths.
- Unknown URL → `/home` → unauthenticated → `/login`.

### 4.6 Non-functional / UX (optional)

- `prefers-reduced-motion` on login success video path (if enabled) still completes login.
- Mobile layout: onboarding welcome split, nav, search filters.

---

## 5. Edge cases and risks


| Area                          | Edge case                                                             | Current behavior / risk                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Login cap**                 | User completes a **3rd** successful verify while still incomplete     | `appLoginCount` becomes 3 → `shouldUseOnboardingFlow` false → `/home` and directory gates behave as returning incomplete. |
| **Missing `appLoginCount`**   | Stale API/client omits field                                          | Treated as **ineligible** for onboarding (`shouldUseOnboardingFlow` → false if incomplete).                               |
| **Profile missing**           | `GET /v1/me/profile` returns no profile after auth                    | Login/AuthVerify send user to `**/home`**; ensure home degrades gracefully.                                               |
| **Race**                      | Auth still `loading` while onboarding step 0 expects `welcomeProfile` | Fallback UI (campus panel) if authenticated state not ready; brief loading if auth slow.                                  |
| **Super admin**             | `person.role === "super_admin"`. Follows the same profile gate and onboarding journey as alumni, in every build. |
| **Deep link `*` → `/home`**   | Unauthenticated bookmark to unknown path                              | Ends on `/login`, not marketing `/`.                                                                                      |
| **Concurrent sessions**       | Logout in one tab                                                     | Other tabs may show stale UI until refresh.                                                                               |
| **API errors mid-onboarding** | PATCH fails                                                           | Step-level error messages; user may retry; partial saves possible per step design.                                        |


---

## 6. Out of scope (for this doc)

- Admin APIs (`adminPeople`, `adminMetrics`, org routes) and any separate admin UI not wired in `App.tsx`.
- Email deliverability, spam, or institutional allowlists (product/ops).
- Exact business rules for when `**profileCompletedAt`** is set (server-side); treat as **source of truth** once exposed in API.

---

## 7. Maintenance

When changing routing or eligibility:

1. Update `**shouldUseOnboardingFlow`** and `**ProfileGate`** together with `**Landing**`, `**Login**`, and `**AuthVerify**` redirect logic to avoid inconsistent destinations.
2. Add a regression test row to §4 for any new role or route.
