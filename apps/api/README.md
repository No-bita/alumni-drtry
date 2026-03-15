# Alumni API (Phase 1-3 in progress)

This service now covers Phase 1, Phase 2, and core Phase 3 features of the alumni platform MVP:

1. Domain allowlist (`@iitbhu.ac.in`, `@itbhu.ac.in`)
2. Email parser (department + joining year extraction)
3. OTP + magic-link verification flow
4. Person record creation on first verified login
5. Session management with secure HTTP-only cookie

## Setup

1. Copy `.env.example` to `.env` and set values.
2. Install dependencies: `npm install`
3. Run DB migrations: `npm run migrate`
4. Start API: `npm run dev`

## Email Delivery

- `EMAIL_PROVIDER=console` logs OTP and magic-link details to stdout (local/dev).
- `EMAIL_PROVIDER=resend` sends real email via Resend.
- When using Resend, set:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
  - optional `EMAIL_REPLY_TO`

## Endpoints

- `POST /v1/auth/start`
- `POST /v1/auth/verify`
- `GET /v1/auth/verify` (magic-link click)
- `POST /v1/auth/logout`
- `GET /v1/me`
- `GET /v1/me/profile`
- `PATCH /v1/me/profile`
- `GET /v1/me/occupations`
- `POST /v1/me/occupations`
- `PATCH /v1/me/occupations/:id`
- `DELETE /v1/me/occupations/:id`
- `GET /v1/me/links`
- `POST /v1/me/links`
- `PATCH /v1/me/links/:id`
- `DELETE /v1/me/links/:id`
- `GET /v1/search`
- `GET /v1/profiles/:id`
- `POST /v1/intentcasts`
- `GET /v1/intentcasts`
- `PATCH /v1/intentcasts/:id/close`
- `POST /v1/intentcasts/:id/respond`
- `GET /v1/intentcasts/:id/responses`
- `POST /v1/contact-requests`
- `PATCH /v1/contact-requests/:id`
- `POST /v1/orgs/suggest`
- `GET /v1/admin/orgs/pending`
- `PATCH /v1/admin/orgs/:id`
- `DELETE /v1/admin/orgs/:id`
- `GET /v1/admin/people/:id`
- `PATCH /v1/admin/people/:id`
- `DELETE /v1/admin/people/:id`
- `GET /v1/admin/people/duplicates`
- `GET /v1/admin/metrics`
- `GET /healthz`

## Security Defaults

- Challenges are single-use and attempt-limited.
- OTP and magic-link tokens are stored hashed.
- Session token is opaque and stored hashed.
- Session cookie is HTTP-only and same-site (`Lax`).
- Start-auth requests are rate-limited by email and IP.
- If email delivery fails, the auth challenge is deleted and `503 AUTH_DELIVERY_FAILED` is returned.

## Profile Update (Phase 2)

`PATCH /v1/me/profile` currently supports:

- `fullName`
- `departmentCode`
- `batchYear`
- `degreeCode` (`null` clears value)
- `personalEmail` (`null` clears value)
- `bio` (`null` clears value)
- `skillsText` (`null` clears value)

`is_searchable` is set automatically when profile has:

1. non-empty name
2. department (vocab or parsed)
3. batch year (profile batch or parsed joining year)

## Discovery (Phase 3)

`GET /v1/search` supports:

- `batchYear`
- `departmentCode`
- `organizationId`
- `occupationTypeCode`
- `keyword` (searches profile bio/skills/name and occupation role/description)
- `limit` (default 20, max 100)
- `cursor` (keyset pagination cursor returned by previous response)

`GET /v1/profiles/:id` returns:

- public profile fields
- occupations
- links

## Contact (Phase 3)

- Intentcast expires in 7 days by default.
- Manual close endpoint: `PATCH /v1/intentcasts/:id/close`
- Expiry job script: `npm run job:intentcasts:expire`
- Intentcast responses are private to intentcast author:
  - create: `POST /v1/intentcasts/:id/respond`
  - view (author only): `GET /v1/intentcasts/:id/responses`

Contact requests:

- compose: `POST /v1/contact-requests`
- recipient decision: `PATCH /v1/contact-requests/:id` with `action=accept|decline`
- notification emails:
  - note received -> recipient institutional email
  - accept/decline -> sender institutional email
