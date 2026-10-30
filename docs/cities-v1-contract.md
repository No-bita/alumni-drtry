# Cities v1: API contract (web ↔ API)

Spec: `cities-v1-handoff/SPEC.md`. This file is the wire contract both sides build against.
All routes need sign-in. Mutations also use `requireNonDemoMutation` (demo → 403 `DEMO_READ_ONLY`).

## Shared shapes

```ts
type CityRef = { placeId: string; city: string; country: string; slug: string };

/** A person as shown on a Cities card. */
type CityPerson = {
  id: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  roleTitle: string | null;        // current job, if any
  organizationName: string | null; // current employer, if any
};

type NoteStatus = "pending" | "accepted" | "declined";

type CoffeeState = {
  open: boolean;            // recipient has "coffee" in open-to
  limit: number | null;     // asks a week (1|2|3|5), null when not open
  spotsLeft: number | null; // limit minus asks this week (Mon–Sun, Asia/Kolkata), null when not open
  askedByMe: boolean;       // viewer has a pending coffee ask to them
};

type CityAlum = {
  person: CityPerson;
  /** Strongest shared thing: "Same batch" | "N batches apart" | "Same department" | "Also at <Company>" | null */
  sharedTag: string | null;
  coffee: CoffeeState;
};

type ReplyStats = { total: number; replied: number; medianDays: number | null };

type CityHelper = CityAlum & {
  replyStats: ReplyStats | null;          // only when ≥ 3 notes
  yourCityAsk: { status: NoteStatus; createdAt: string } | null; // latest relocation/visiting note from viewer
};

type CityArrival = {
  id: string;
  person: CityPerson;
  arrivedDaysAgo: number;          // whole days since opted_in_at
  previousCity: string | null;     // "Pune"
  myOffer: { id: string } | null;  // viewer's active (not withdrawn) offer
  wroteToMe: { contactRequestId: string; status: NoteStatus } | null; // newcomer's note answering my offer
};

type HelpKind = "areas" | "commute" | "coffee" | "intros";

type NewcomerOffer = {
  id: string;
  offerer: CityPerson;
  kinds: HelpKind[];
  line: string | null;
  createdAt: string;
  seen: boolean;
  myNote: { contactRequestId: string; status: NoteStatus } | null; // the newcomer's note to this offerer
};

type CityPost = {
  id: string;
  authorPersonId: string;
  authorFullName: string;
  authorBatchYear: number | null;
  content: string;
  createdAt: string;
  viewerHasResponded: boolean;
  isMine: boolean;
};
```

## Reads

### `GET /v1/cities`
City switcher + viewer's own city.
```ts
{ viewerCity: CityRef | null; cities: Array<CityRef & { count: number }> } // count desc, max 120
```
Only canonical places with at least one listed alum (plus the viewer's own city). The page route
`/intent/location/:citySlug` resolves the slug against this list; `/intent/location` opens the viewer's city
(or the no-city screen when `viewerCity` is null).

### `GET /v1/cities/search?q=beng`
Canonical places for the "Where do you live?" input (city label or a known spelling). `{ places: CityRef[] }`, max 8.

### `GET /v1/cities/:placeId`
Everything for one city. 404 `CITY_NOT_FOUND`.
```ts
{
  place: CityRef;
  viewerRole: "local" | "newcomer" | "arriver" | "no_city";
  viewerCity: CityRef | null;
  v1Enabled: boolean;                      // city is in CITIES_V1_PLACE_IDS (Bengaluru)
  counts: { alumni: number; openToCityHelp: number };
  arrivalPrompt: boolean;                  // local in a v1 city, moved here in the last 30 days, never opted in → "Just moved? Show me as new in town"
  nudgeFrequency: "weekly" | "monthly" | "never";

  // local only, v1 only (else null). Newest first; up to 50 items (the page shows 2, "See all" the rest) + total.
  arrivals: { total: number; items: CityArrival[] } | null;

  // newcomer only (else null / [])
  myArrival: { id: string; visibleUntil: string; daysLeft: number; previousCity: string | null } | null;
  offers: NewcomerOffer[];                 // newest first; still returned after "Stop showing me as new" until the 30 days end

  // local + newcomer, v1 only (else null)
  helpPanel: {
    askCount30d: number | null;            // explicit relocation searches matching city+country; null when < 3
    pendingNotesForMe: number;
    cityHelpOn: boolean;
    openToCount: number;                   // how many open-to tags the viewer has (cap is 5)
  } | null;

  // local + newcomer: first 4 alumni for filter "batch"
  alumni: { total: number; items: CityAlum[] } | null;

  // v1 only: up to 3 open Wall posts tagged with this city (local + newcomer)
  posts: CityPost[];
  chapterLink: { url: string; label: string } | null;

  // arriver only (else [] / null)
  helpers: CityHelper[];                   // open to city help, relocation ranking
  others: CityAlum[];                      // shared batch / department / company, max 4
  pendingCityAsks: number;                 // viewer's pending relocation+visiting asks, all cities (limit 3)
  country: { name: string; alumni: number } | null; // for "Nobody in [city] yet · N in [country]"
}
```
`no_city` viewers get the arriver payload for the city they browse. An arriver view logs demand (once per viewer, city, day).

### `GET /v1/cities/:placeId/alumni?filter=batch|department|company|coffee&cursor=`
```ts
{ items: CityAlum[]; total: number; nextCursor: string | null } // 20 per page
```
Filters: `batch` = within ±2 batch years, `department` = same department, `company` = same current company,
`coffee` = open to coffee. Sort always: shared batch window, then department, then company, then name.

## Writes

| Call | Body | Result |
|---|---|---|
| `POST /v1/cities/arrivals` | `{ placeId }` | `201 { arrival: { id, visibleUntil } }`. 409 `ARRIVAL_NOT_ELIGIBLE` unless the place is the viewer's current city, in v1, and they moved there (from another city) within 30 days |
| `POST /v1/cities/arrivals/end` | – | `204` (no active arrival → 204 too) |
| `POST /v1/cities/arrivals/:arrivalId/offers` | `{ kinds: HelpKind[] (≥1), line?: string (≤160) }` | `201 { offer: { id } }`. 409 `OFFER_DUPLICATE`, 404 `OFFER_NOT_FOUND` (arrival not active), 403 `OFFER_NOT_LOCAL` |
| `DELETE /v1/cities/offers/:offerId` | – | `204`; 404 `OFFER_NOT_FOUND` when not yours |
| `POST /v1/cities/offers/seen` | – | `204` |
| `PATCH /v1/me/city-nudge` | `{ frequency: "weekly"\|"monthly"\|"never" }` | `200 { frequency }` |
| `PATCH /v1/me/profile` | existing | `200 { profile, arrivalPrompt: { placeId, cityName } \| null }` |
| `POST /v1/contact-requests` | existing + `source: "cities"`, `sourceCategory: "coffee"\|"relocation"\|"visiting"\|"newcomer"`, `cityHelpOfferId?` | as before |
| `POST /v1/intentcasts` | existing + `placeId?` | as before |

`openToPreferences` (profile read and write) gains `limits?: { coffee?: 1 | 2 | 3 | 5 }`.
Writing `coffee` in `selected` without a valid `limits.coffee` → 400 `COFFEE_LIMIT_REQUIRED`, unless the stored
profile already had coffee on (legacy rows read as 2).

Contact-request rules for `source: "cities"`:
- `coffee`: recipient open to coffee (403 `COFFEE_NOT_OPEN`), under their weekly limit (409 `COFFEE_LIMIT_REACHED`),
  message ≥ 40 chars (400 `COFFEE_REASON_TOO_SHORT`).
- `relocation` / `visiting`: recipient open to city help (403 `CITY_HELP_NOT_OPEN`), sender has < 3 pending such asks (429 `CITY_ASK_LIMIT`).
- `newcomer`: `cityHelpOfferId` required; offer must be to the sender's arrival, not withdrawn, from the recipient (404 `OFFER_NOT_FOUND`).

Error bodies are `{ code, message }`.

## Notifications

`GET /v1/notifications` gains:
```ts
{ kind: "city_help_offer_received"; id: string; occurredAt: string; offerId: string;
  offererPersonId: string; offererFullName: string | null; kinds: HelpKind[]; cityName: string }
```
and `contact_request_received` items gain `source: string | null` and `sourceCategory: string | null` so copy can be keyed by category.
In-app only for offers (no email per offer — decided).

## Env

- `CITIES_V1_PLACE_IDS`: comma-separated canonical place ids. Unset → Bengaluru, India looked up by name.
- `CITY_CHAPTER_LINKS`: JSON `{ "<placeId>": { "url": "...", "label": "..." } }`.
- City-update email rollout is parked. The production reminder scheduler does not call it. Email code remains for later approval and isolated testing; no `CITY_NUDGE_SCHEDULER` setting exists.
- Daily Cities-view deduplication keys are retained; `purgeDemandKeys()` does not delete records. Passive views never contribute to the moving-help search count.
