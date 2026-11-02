# City review

How cities that members type are reviewed, combined and recorded. Database change: `056_city_review.sql`
(two earlier migrations are both numbered 055 and already applied in production, so this starts at 056).

## The switch

`CITY_REVIEW_ENABLED` (API env, default `false`).

| | Off | On |
|---|---|---|
| Unknown city typed during onboarding or profile edit | Saved as typed text, no city link | New **pending** city, linked to the member |
| Admin queue `/admin/cities` and its API | 404 | On |
| Matching only inside the chosen country | Yes | Yes |
| Safe combining, history, hiding non-approved cities | Yes | Yes |

Turn it on only after the migration has run and the queue has been checked on staging.

## What happens when a member types a city

1. The country is normalised to one name (`USA`, `U.S.A.`, `United States of America` → `United States`;
   list in `apps/api/src/lib/countries.ts`, kept in step with the web's phone country list by a test).
   Unknown countries are kept as typed. No country → no city link.
2. The city is looked up **only in that country**: label first, then known spellings. A combined city is followed
   to the city it now points at.
3. Approved or pending → linked. **Rejected → not linked and not reopened**; the typed text is saved and the
   member shows as having no city.
4. Nothing found (switch on) → a pending city is created and linked, with a `submitted` history row, in one
   transaction. Two people typing it at once get one city (unique index + `ON CONFLICT`).
5. A member can create at most 5 new cities in 30 days; after that the typed text is saved without a link.

## Who sees what

- Pending, rejected and combined cities never appear in city lists, counts, city search, directory city
  filters, `residence-cities`, Ask/WhatsApp place matching, analytics, or as a Wall post's city.
- A pending or rejected city's page opens only for members linked to it and admins (404 for everyone else).
- A rejection reason is shown only to the member who first typed the city and to admins. Other linked members
  see "This city wasn't added." Members stay linked on rejection, so reopening restores them.
- Profiles show an approved city's name; otherwise the member's typed text.

## Admin review (`/admin/cities`)

Waiting / Rejected tabs and a search. Each city shows its country, linked members, the masked email of the
member who typed it, its other spellings and when it was added.

- **Approve** (optionally fix the name first; the typed spelling keeps working).
- **Same city as…** an approved city: a safe combine (below).
- **Reject** with a required reason (3–500 characters).
- **Reopen** a rejected city (back to Waiting).

Links: Analytics page (next to Company review) and the Admin tools card on an admin's profile.

## Safe combining

Used by the queue, Location cleanup (combine) and `POST /v1/admin/places/merge`. In one transaction:

- people's current city and previous city, newcomer arrivals (city and previous city) and Wall city tags move to
  the kept city;
- the other city's spellings are copied and its label becomes a spelling of the kept city;
- the other city becomes a redirect (`status = combined`, `combined_into_place_id`); cities already redirected to
  it are pointed straight at the kept city (no chains);
- nothing is deleted and members' typed text is not changed.

The kept city must be approved.

## History

`place_history` records `submitted`, `approved`, `rejected`, `reopened`, `combined`, `renamed`, `alias_added`
(`alias_removed` is reserved): who acted, when, and the reason or target city. Each row is written in the same
transaction as the change. It is admin-only, starts at deployment (no backfill), and is append-only (a trigger
refuses edits and deletes). A city in the history can't be deleted. When a person is hard-deleted, their history
rows stay with the actor cleared (anonymised), so deletion never fails. Location cleanup's "recent activity"
shows this history plus the older Location cleanup log (read-only; nothing new is written there).
