# Alumni Platform MVP Roadmap

Last updated: March 8, 2026

## Phase Status

| Phase | Name | Goal | Status |
| --- | --- | --- | --- |
| 1 | Foundation | Verified identity and basic profile exists | Code complete, runtime verification pending |
| 2 | Directory | Alumni can be searched and found | Code complete, runtime verification pending |
| 3 | Contact | Alumni can reach each other meaningfully | Code complete, runtime verification pending |
| 4 | Admin | Platform can be maintained and kept clean | In progress alongside Phase 2 |

## Phase 1 verification

Foundation auth (domain allowlist, email parsing, OTP/magic link, person bootstrap, sessions) is exercised by **API tests** under [`apps/api/tests/`](../apps/api/tests/) — including auth flows and e2e coverage — alongside the modules wired in [`apps/api/src/app.ts`](../apps/api/src/app.ts) (`authRoutes`, `authService`, domain helpers). The retired prose checklist was replaced by those living tests and this roadmap table.

## Phase 1 Tasks

| Task | What | Output | Status |
| --- | --- | --- | --- |
| 1 | Domain allowlist | Config accepting `@iitbhu.ac.in` and `@itbhu.ac.in` only | Done |
| 2 | Email parser | Extract department and joining year from email structure | Done |
| 3 | OTP/magic link auth | Verified login flow via institutional email | Done |
| 4 | Person record creation | Create person on first verified login | Done |
| 5 | Session management | Keep user logged in securely | Done |

## Phase 2 Build Order

| Order | Task | Endpoint | Status |
| --- | --- | --- | --- |
| 1 | Controlled vocab migration | DB only | Done (code) |
| 2 | Organisations table + seed | DB only | Done (code) |
| 3 | Admin role on people table | DB only | Done (code) |
| 4 | Extend people table | DB only | Done (code) |
| 5 | Profile endpoint | `PATCH /v1/me/profile` | Done (code) |
| 6 | Searchability flag | Automatic trigger from task 5 | Done (code) |
| 7 | Occupation table migration | DB only | Done (code) |
| 8 | Occupation endpoints | `POST/PATCH/DELETE /v1/me/occupations` | Done (code) |
| 9 | Org suggestion flow | `POST /v1/orgs/suggest` | Done (code) |
| 10 | Admin org queue | `GET /v1/admin/orgs/pending` | Done (code) |
| 11 | Admin org approve | `PATCH /v1/admin/orgs/:id` | Done (code) |
| 12 | Admin org reject | `DELETE /v1/admin/orgs/:id` | Done (code) |
| 13 | Links table migration | DB only | Done (code) |
| 14 | Links endpoints | `POST/PATCH/DELETE /v1/me/links` | Done (code) |
| 15 | Personal email endpoint | `PATCH /v1/me/profile` extension | Done (code) |

## Phase 2 Vocab Seed

| Table | Values |
| --- | --- |
| occupation_type | Full time employment \| Part time employment \| Freelance / Consulting \| PhD / Research \| Postdoctoral research \| Founded a venture \| Civil services / Government \| Military \| Higher education (non-research) \| Sabbatical / Career break \| Other |
| department | Parsed from email and seeded from known IIT BHU department codes |
| degree | BTech \| MTech \| PhD \| MBA \| MSc \| Other |

## Phase 3 Decisions Locked

| ID | Decision | Resolution |
| --- | --- | --- |
| 1 | Platform mask Priya email when forwarding | Yes, platform forwards without exposing her address |
| 2 | Does reply expose Priya email | Yes, once she replies her email is visible to Arjun |
| 3 | Contextual note prompt | Single field: "what are you hoping to talk about" |
| 4 | Intentcast visibility | Logged-in alumni only |
| 5 | Intentcast expiry | Auto-expires after 7 days, user can close manually |
| 6 | Intentcast responses | Private, visible only to the poster |
| 7 | Personal email sharing | Shared only after a formal accept/decline step |
| 8 | Fallback if no personal email | Institutional email is used |
| 9 | Name-only profile searchable | Yes, name + department + batch is enough |
| 10 | Notification destination | Institutional email only |

## Phase 3 Build Order

| Order | Task | Endpoint | Depends On | Status |
| --- | --- | --- | --- | --- |
| 1 | Search filters | `GET /v1/search` with batch/department/org/occupation_type | Phase 2 complete | Done (code) |
| 2 | Keyword search | Extend `GET /v1/search` over bio and role descriptions | 1 | Done (code) |
| 3 | Search results page | Paginated with keyset pagination | 1 and 2 | Done (code) |
| 4 | Profile view page | `GET /v1/profiles/:id` for logged-in alumni | 3 | Done (code) |
| 5 | Intentcast table migration | DB only | None | Done (code) |
| 6 | Intentcast composer | `POST /v1/intentcasts` | 5 | Done (code) |
| 7 | Intentcast feed | `GET /v1/intentcasts` for logged-in alumni only | 6 | Done (code) |
| 8 | Intentcast expiry job | Background job to auto-close after 7 days | 6 | Done (code) |
| 9 | Intentcast manual close | `PATCH /v1/intentcasts/:id/close` | 6 | Done (code) |
| 10 | Intentcast response | `POST /v1/intentcasts/:id/respond`, private to poster | 7 | Done (code) |
| 11 | Contact request table migration | DB only | None | Done (code) |
| 12 | Contextual note composer | `POST /v1/contact-requests` | 4 | Done (code) |
| 13 | Platform email forwarding | Deliver note to Priya without exposing address | 12 | Done (code) |
| 14 | Accept/decline endpoint | `PATCH /v1/contact-requests/:id` | 13 | Done (code) |
| 15 | Notification on note received | Email to Priya institutional address | 13 | Done (code) |
| 16 | Notification on accept | Email to Arjun with Priya contact | 14 | Done (code) |
| 17 | Notification on decline | Email to Arjun with no contact shared | 14 | Done (code) |

## Phase 4 Admin Tasks

| Order | Task | Endpoint | Depends On | Status |
| --- | --- | --- | --- | --- |
| 1 | Admin role on people table | DB only | Phase 2 task 3 | Done (code) |
| 2 | Org approval queue | `GET /v1/admin/orgs/pending` | Phase 2 task 9 | Done (code) |
| 3 | Org approve | `PATCH /v1/admin/orgs/:id` | 2 | Done (code) |
| 4 | Org reject | `DELETE /v1/admin/orgs/:id` | 2 | Done (code) |
| 5 | Account management | `GET/PATCH/DELETE /v1/admin/people/:id` | Phase 1 complete | Done (code) |
| 6 | Duplicate flagging | `GET /v1/admin/people/duplicates` (same name + batch) | Phase 2 task 5 | Done (code) |
| 7 | Basic metrics | `GET /v1/admin/metrics` (signups, completion, search volume) | Phase 3 task 1 | Done (code) |

## Deferred Features

| ID | Feature | Context |
| --- | --- | --- |
| 1 | Public intentcast status layer | Revisit after MVP |
| 2 | Privacy controls | Field-level visibility after MVP |
| 3 | Warm intro through mutuals | Needs graph edge data, phase 2 of long roadmap |
| 4 | Intent-based matching | Deterministic scoring on structured data, phase 3 of long roadmap |
| 5 | Graph relationship engine | `person_edge` table + traversal, phase 2 of long roadmap |
| 6 | Mobile app | Web only for MVP |
| 7 | LinkedIn sync | Business and API risk, deferred indefinitely |
| 8 | Skills as a profile field | Explicitly out of scope — not collected on the platform |
| 9 | Neo4j or graph database | Only if multi-hop traversal gets heavy |
| 10 | Embeddings and semantic search | Only after bio completion rate is above 50% |

## Critical Path

| Phase | Can Start When |
| --- | --- |
| 1 | Runtime validation pending |
| 2 | Immediately |
| 3 | After Phase 2 runtime validation |
| 4 | After Phase 2 task 3 complete (runs in parallel to Phase 3) |

## Gaps Before Production

| ID | Gap | Priority |
| --- | --- | --- |
| 1 | Configure Resend credentials in deployment (`EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`) | High |
| 2 | CORS config with `@fastify/cors` before frontend integration | Done |
| 3 | Schedule intentcast expiry job (`npm run job:intentcasts:expire`) in production cron/worker | High |
| 4 | Auth integration tests | Done |
| 5 | Root README | Done |
