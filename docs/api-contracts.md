# API Contracts

The API is versioned under `/v1`. Responses are JSON unless the route returns `204 No Content`.

Error responses use:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message"
}
```

`429` responses may also include a `Retry-After` header.

## Auth And Session

- `POST /v1/auth/start`: starts OTP or magic-link authentication. Returns `challengeId`, `sentTo`, `delivery` and `resendAfterSeconds`:
  - `delivery: "sent"`: a new code was emailed; older open codes for that email are retired (`superseded_at`, migration 049).
  - `delivery: "already_sent"`: a start for the same email within `AUTH_START_DUPLICATE_WINDOW_SECONDS` (default 120) reuses that attempt and sends no email.
  - `delivery: "unconfirmed"`: Resend never answered (timeout or dropped connection after connecting). The attempt is kept, because the email may still arrive and its code works; repeats within the window reuse it.
  - `503 AUTH_DELIVERY_FAILED`: Resend clearly rejected the send, or was never reached. Nothing is kept and the previous code stays valid. Clients must show this, not retry it silently; only `AUTH_START_BUSY`, network failures and proxy 502/503/504 pages are safe to retry.
  - Optional `whatsappEntry: { token, next? }` (sign-in started from a WhatsApp bot link): when the token is a valid bot link or a short link code, the email's magic link gets `&wa=<token>&waNext=<same-site path>`, so clicking it in any browser continues to `/wa`. Invalid tokens and off-site paths are left out.
- `POST /v1/auth/verify`: verifies an OTP challenge. `401 AUTH_CODE_SUPERSEDED` when the code is from an earlier email for the same address.
- `GET /v1/auth/verify`: verifies a magic-link click. `401 AUTH_CODE_SUPERSEDED` for a link from an earlier email.
- `POST /v1/auth/password-login`: password login for supported admin/dev flows.
- `POST /v1/auth/logout`: clears the session.
- `POST /v1/auth/logout-all` (signed in, not the demo account): ends every session for this member, including the current one, and clears the cookie. `204`.
- Sessions: 7 days without use (`SESSION_SLIDING_HOURS`, default 168), 30 days at most (`SESSION_HARD_CAP_HOURS`, default 720). See docs/sign-in.md.
- `GET /v1/auth/google/config`: returns whether Google auth is enabled.
- `GET /v1/auth/google/start`: starts Google OAuth.
- `GET /v1/auth/google/callback`: completes Google OAuth.
- `GET /v1/me`: returns `{ person }` for the current session.
- `GET /v1/me/profile`: returns `{ profile }` for the current user.

The browser treats `/v1/me` plus `/v1/me/profile` as the session snapshot.

## Profile And Onboarding

- `PATCH /v1/me/profile`: updates profile fields and onboarding timestamps.
- `GET /v1/me/occupations`: returns `{ occupations }`.
- `POST /v1/me/occupations`: creates an occupation.
- `PATCH /v1/me/occupations/:id`: updates an occupation.
- `DELETE /v1/me/occupations/:id`: deletes an occupation.
- `GET /v1/me/links`: returns `{ links }`.
- `POST /v1/me/links`: creates a profile link.
- `PATCH /v1/me/links/:id`: updates a profile link.
- `DELETE /v1/me/links/:id`: deletes a profile link.

## Directory And Discovery

- `GET /v1/search`: returns `{ results, pageInfo, ...metadata }`.
- `GET /v1/profiles/:id`: returns public profile detail.
- `GET /v1/directory/residence-cities`: returns residence city suggestions.
- `POST /v1/discovery/analytics/profile-click`: records a profile click from a search session.

Search responses exclude the current viewer and include stable `matchReasons` keys that the web maps to display labels.

## Ask → Match

- `POST /v1/match`: body `{ question, overrides? }` (question 3–500 chars; `overrides` may set `category`, `company`, `role`, `city`, `country`, where `null` clears a parsed value). Returns `{ intent, needsDetail, results, fallback }`: up to 5 alumni, each with `reasons[]` and a `whyThem` string built only from matched profile fields. Uses the directory read rate limit. See [ask-match.md](./ask-match.md).

## Intentcasts And Bulletin

- `POST /v1/intentcasts`: creates a bulletin post.
- `GET /v1/intentcasts`: returns `{ intentcasts, pageInfo }`.
- `GET /v1/intentcasts/:id`: returns `{ intentcast }` if visible to the viewer.
- `PATCH /v1/intentcasts/:id`: edits an open post during the edit window.
- `PATCH /v1/intentcasts/:id/close`: closes a post.
- `DELETE /v1/intentcasts/:id`: author-removes a post.
- `POST /v1/intentcasts/:id/restore`: restores an author-removed post within the retention window.
- `POST /v1/intentcasts/:id/respond`: creates a private response to the author.
- `GET /v1/intentcasts/:id/responses`: returns `{ responses }` for the post author.

## Careers (signed in)

- `GET /v1/careers/company?name=&role=`: the company screen. `{ company, current, past }`; each person `{ id, fullName, batchYear, roleTitle, organizationName, openToReferrals, yourNote }`. Matches a company the way Ask does (the company's name or its main company's name contains the typed name as whole words, ignoring capitals); current open-to-referrals first; at most 100; never the viewer; demo/test profiles follow Ask's rules. Each lookup is logged in the search log as a referral question with `parser_source = 'careers'` (not for the demo account). Same read budget as the directory.
- `GET /v1/careers/referral-companies`: `{ companies: [{ company, alumni }] }`: companies (main names) where alumni working there now are open to referrals, most first, at most 50.
- `GET /v1/careers/my-company-demand`: `{ demand: { company, asks, days } | null }`: asks (Ask questions and Careers lookups) naming your current company, its main name or names linked to it, in the last 30 days; null without a current company.
- `POST /v1/contact-requests` accepts `source: "careers"` (migration 053).

## Cities v1 (signed in; Bengaluru first)

Full wire contract: [docs/cities-v1-contract.md](cities-v1-contract.md). Migration 055.

- `GET /v1/cities`, `GET /v1/cities/search?q=`, `GET /v1/cities/:placeId`, `GET /v1/cities/:placeId/alumni?filter=&cursor=`.
- `POST /v1/cities/arrivals`, `POST /v1/cities/arrivals/end`, `POST /v1/cities/arrivals/:arrivalId/offers`, `DELETE /v1/cities/offers/:offerId`, `POST /v1/cities/offers/seen`, `PATCH /v1/me/city-nudge`.
- `PATCH /v1/me/profile` returns `arrivalPrompt` and resolves the typed city to a canonical place; `openToPreferences.limits.coffee` (1/2/3/5) is required to turn coffee on.
- `POST /v1/contact-requests` accepts `source: "cities"` with `coffee`, `relocation`, `visiting`, `newcomer` (+ `cityHelpOfferId`). `POST /v1/intentcasts` accepts `placeId`.
- `GET /v1/admin/metrics/cities?days=7|30|90` (admins).

## WhatsApp pilot (off unless `WHATSAPP_ENABLED=true`; see docs/whatsapp-setup.md)

- `GET /v1/whatsapp/webhook`: Meta's one-time verification (`hub.verify_token` must equal `WA_VERIFY_TOKEN`).
- `POST /v1/whatsapp/webhook`: messages and delivery statuses. Requires a valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `WA_APP_SECRET`); answers `200` immediately and processes afterwards; re-deliveries are ignored.
- `GET /v1/me/whatsapp` (signed in): `{ linked, numberHint, notesOptedIn, notesPaused, stopped, botNumber }`.
- `PATCH /v1/me/whatsapp` `{ notesOptedIn?, notesPaused? }` (signed in).
- Bot links are short: `/w/<code>` (8 letters/digits, 24 hours). Wherever these endpoints take `token`, a short code works too; the server looks up the signed link behind it.
- `POST /v1/me/whatsapp-link/check` `{ token }` (signed in): what the bot's link would do, before asking the member: `{ link: { status, numberHint, next } }` (`next`: a short link's destination, else null), where `status` is `ready`, `already_yours`, `linked_elsewhere`, `you_have_another` or `used`, and `numberHint` is the last 4 digits. Links nothing. `400 WHATSAPP_LINK_INVALID` when expired or tampered.
- `POST /v1/me/whatsapp-link` `{ token }` (signed in, after the member confirms): links the number in the bot's signed link (24-hour expiry). Each link works once, a linked number never moves to another member, and a member keeps their first number (an admin can unlink by hand). `200` when linked or already this member's; `400 WHATSAPP_LINK_INVALID`; `409 WHATSAPP_NUMBER_TAKEN` (another member's number), `409 WHATSAPP_ALREADY_LINKED` (this member has a different number), `409 WHATSAPP_LINK_USED`.
- Notes: when the alum opted in (and the monthly template cap isn't reached), `POST /v1/contact-requests` sends the note as a WhatsApp template instead of email; `delivery_channel` records which. `source` also accepts `"whatsapp"` (notes sent from the bot's links). If WhatsApp later reports the note as failed, the alum is emailed instead (once) and `delivery_channel` becomes `email`. If WhatsApp doesn't answer in time, the alum is emailed at once; the send is recorded as `uncertain` and counts toward the monthly cap until Meta's status update (matched by the note id in `biz_opaque_callback_data`) says otherwise.

## Home

- `GET /v1/home/summary`: aggregate counts for the Home reassurance line (`alumni`, `companies`, `openToReferrals`). Counts the people Match can return to the viewer (live, profile complete, discoverable, not the viewer); `companies` is distinct current employers among them, excluding study programmes. No names or ids. Cached per viewer for 10 minutes in memory.

## Contact And Messaging

- `GET /v1/contact-requests/sent`: the viewer's sent notes (newest first, max 100) with status; `recipientContactShared` only when accepted.
- `POST /v1/contact-requests` (migration 055): two shapes, by surface.
  - Note form (every surface except Cities): `{ recipientPersonId, note, source?, sourceRank? }`. The server builds the readable `message` from `note` (so email, WhatsApp, reminders and Notifications are unchanged) and stores the fields in `contact_requests.details`; the category comes from the note (referral → `referral`; advice → its topic; `other` → none). `note` is one of:
    - `{ purpose: "referral", jobUrl, role, company, fit, resumeUrl? }`: `jobUrl` and `resumeUrl` are http(s) links with a dotted host (≤ 500 characters); `role` and `company` 1–120 characters (spaces tidied); `fit` 80–500 characters.
    - `{ purpose: "advice", topic, question }`: `topic` is `interview_prep`, `career_switch`, `higher_studies`, `relocation`, `founder_advice` or `other`; `question` 80–1000 characters.
    - Errors (400): `CONTACT_REQUEST_PURPOSE_REQUIRED` (missing or unknown purpose, including a bare `message` outside Cities), `CONTACT_REQUEST_JOB_LINK_REQUIRED`, `CONTACT_REQUEST_ROLE_REQUIRED`, `CONTACT_REQUEST_COMPANY_REQUIRED`, `CONTACT_REQUEST_FIT_LENGTH`, `CONTACT_REQUEST_RESUME_LINK_INVALID`, `CONTACT_REQUEST_TOPIC_REQUIRED`, `CONTACT_REQUEST_QUESTION_LENGTH`. Each has a plain-language `message`.
  - Cities v1 (unchanged): `{ recipientPersonId, message, source: "cities", sourceCategory, cityHelpOfferId? }` - free-text `message` (min 10 characters), category one of `coffee`, `relocation`, `visiting`, `newcomer`; `cityHelpOfferId` only with `newcomer`. Coffee asks need a 40+ character reason; at most 3 relocation/visiting asks waiting at once.
  - Returns `409 CONTACT_REQUEST_DUPLICATE_PENDING` when a note to the same person is still pending; the existing per-sender window limit stays.
  - `GET /v1/contact-requests/inbox`, `GET /v1/contact-requests/sent` and `contact_request_received` notifications include `details` (null on Cities notes and notes sent before the form); inbox items and notifications also include `source` and `sourceCategory` for wording.
- `GET /v1/admin/metrics/ask-match` (admin): Ask → Match funnel and profile completeness.

- `POST /v1/contact-requests`: creates a contact request.
- `GET /v1/contact-requests/inbox`: returns pending incoming requests.
- `PATCH /v1/contact-requests/:id`: accepts or declines a request.
- `GET /v1/connection-threads`: returns thread summaries.
- `GET /v1/connection-threads/:id`: returns thread detail.
- `POST /v1/connection-threads/:id/messages`: adds a message.
- `POST /v1/connection-threads/:id/disclosures`: shares selected contact details.

## Notifications

- `GET /v1/notifications/summary`: returns `{ count }`.
- `GET /v1/notifications`: returns notification feed items.

## Organizations And Admin

- `POST /v1/orgs/suggest`: suggests an organization.
- `GET /v1/admin/orgs/pending?limit=` (1–200, default 50): pending company names, oldest first. Each has `createdByEmailMasked` ("sh•••@itbhu.ac.in"); the full creator email is not returned.
- `GET /v1/admin/orgs/approved?q=` (admins): the "Same company as…" picker. `{ organizations: [{ id, name }] }`: approved companies that aren't themselves linked to another, name contains `q` (ignoring capitals; `%` and `_` are plain text), ordered by name, at most 20. Empty `q` returns the first 20.
- `PATCH /v1/admin/orgs/:id`: approves or updates an organization.
- `GET /v1/admin/orgs/approved/all?q=` (admins): Company review's "Approved companies" section. `{ organizations: [{ id, name, submittedName, linkedTo: { id, name } | null, linkedNames }] }`: every approved company, linked or not, whose name or first-typed name contains `q`, by name, at most 50.
- `PATCH /v1/admin/orgs/:id/name` body `{ name }` (admins; pending or approved): renames the company for everyone who picked it. The name is tidied (control characters out, spaces collapsed), 2–120 characters. The first name it had is kept as `submittedName` (later renames don't overwrite it). Returns `{ result: "renamed", organization }`, or, when another company already has the name (ignoring capitals), changes nothing and returns `{ result: "taken", existing: { id, name, status: "approved"|"linked"|"pending"|"rejected", linkedToName, linkTo: { id, name } | null } }` where `linkTo` is the main company it can be marked "Same company as" instead. Errors: `ORG_INVALID_NAME`, `ORG_NAME_UNCHANGED`, `ORG_REJECTED` (409), `ORG_NOT_FOUND`.
- `PATCH /v1/admin/orgs/:id/link` body `{ canonicalOrganizationId }` (admins): "Same company as…" for an approved company. The target must be an approved company that isn't linked to another and isn't itself. Names linked to this company move to the target, so links stay one level deep. Returns `{ organization, movedLinkedNames }`. Nothing is deleted. Errors: `ORG_NOT_APPROVED` (409), `ORG_INVALID_CANONICAL` (400), `ORG_NOT_FOUND`.
- `DELETE /v1/admin/orgs/:id`: rejects/removes an organization.
- `GET /v1/admin/people/:id`: returns admin person detail.
- `PATCH /v1/admin/people/:id`: updates admin-managed person fields.
- `DELETE /v1/admin/people/:id`: deletes or disables a person according to route behavior.
- `GET /v1/admin/people/duplicates`: lists duplicate candidates.
- `GET /v1/admin/metrics`: returns platform metrics.

Admin routes require `admin` or `super_admin`; super-admin-only routes must also use `requireSuperAdmin`.

## Campus Monthly

- `GET /v1/campus-monthly/current`: returns the current issue.
- `POST /v1/campus-monthly/issue`: uploads or creates an issue using multipart form data.

## Health

- `GET /healthz`: returns API and database health.
