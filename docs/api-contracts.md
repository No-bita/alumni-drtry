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
- `POST /v1/contact-requests` also accepts optional `source: "match"` and `sourceCategory`; returns `409 CONTACT_REQUEST_DUPLICATE_PENDING` when a note to the same person is still pending.
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
- `GET /v1/admin/orgs/pending`: lists pending organization suggestions.
- `PATCH /v1/admin/orgs/:id`: approves or updates an organization.
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
