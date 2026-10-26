# Ask → Match

A member types what they are trying to get done ("Need a referral for PM at Razorpay"). The app returns up to 5 alumni who can help, with a factual *why them* for each.

- **Web:** question box in the Home hero (`HomeAskBox`) → `/match?q=…` (`MatchPage`).
- **API:** `POST /v1/match` → `MatchService` → `MatchRepo` (SQL) → `rankMatches` (TS).

## How a question becomes matches

1. **Lexicon lookup (DB).** Find organization names and canonical places that appear in the question text (`MatchRepo.findLexicon`).
2. **Parse (rules, `lib/matchIntent.ts`).** Turn the question into `{ category, company, role, fromRole, city, country, studyPrograms, keywords }`. No network calls. A small built-in list of cities and countries is used only when the directory has no matching place.
3. **Overrides.** Corrections from the chips on `/match` (kept in the URL) replace parsed values. `null` clears a value.
4. **Candidates (SQL).** Same visibility as directory search: not deleted, not suspended, has `full_name`, `profile_completed_at` set, discoverable for the viewer, and never the viewer. Each row carries signals: current or past job at the company, role match (current or past), past "from" role (career switch), city/country, study program or higher-ed job type, founder, keyword hits, and open-to tags.
5. **Rank (TS, `lib/matchScore.ts`).** A candidate must have at least one **"can help"** signal for the category. Open-to tags and keywords never qualify anyone on their own; they only reorder within a tier.
6. **Why them.** Built only from the signals that matched, e.g. `Currently Senior Product Manager at Razorpay · Open to referrals`.

| Category | Qualifies ("can help") | Boost ("will help": open-to) |
|---|---|---|
| `referral` | Currently at the company (or holds the role now, if no company was named) | referrals, hiring |
| `interview_prep` | At the company now or before, and/or held the role | mentorship, coffee |
| `career_switch` | Holds the target role now (bonus if they held the "from" role before) | mentorship, coffee |
| `higher_studies` | Higher-education / research job (bonus for the named program) | mentorship, advising |
| `relocation` | Lives in the city (or the country, when no city was named) | coffee, intros |
| `founder_advice` | "Founded a venture" job type or a founder title | collaboration, advising |
| *(no clear category)* | The most specific thing named: company, then role, then place, then study program | — |

The SQL query only fetches rows that have one of the qualifying signals above, so its candidate cap (300) can never hide someone who would qualify behind people who can't.

When the question gives nothing to search on (for example "moving to a new city" with no city), the response sets `needsDetail: true` and the page asks for the missing field. When a searchable question finds nobody, `fallback: "post_bulletin"` makes the page offer a bulletin pre-filled with the question.

## Reach out

Messaging is paused. **Reach out** sends one note through the existing contact-request flow (`POST /v1/contact-requests`): the recipient gets the note by email, and the sender gets the recipient's contact address only if they accept.

## Privacy

- `match_queries` (migration `046`) stores only `category`, the **names** of detected fields, parser source, result count and whether overrides were used. It stores **no** person id, **no** question text and **no** company, role or city values. Queries from demo accounts are not logged. Set `MATCH_ANALYTICS_ENABLED=false` to turn logging off.

## Optional LLM parser (off)

`MATCH_LLM_ENABLED` (default `false`) lets `MatchService` try an LLM question parser before the rules parser. **No provider ships yet.** To add one, implement `MatchIntentLlmProvider` (`lib/matchIntentLlm.ts`) and pass it to `new MatchService(pool, provider)` in `app.ts`. The contract: only the question text is sent; the output must pass a strict schema; any error, timeout (3 s) or invalid output falls back to the rules parser.

## Known limits (V1)

- Match quality depends on how complete profiles are: job history, open-to tags and bio.
- Supplier, first-customer and investor questions are not covered yet: profiles don't record what a company makes or buys.
- The role vocabulary is a fixed list (`ROLE_DEFINITIONS`). A role typed into a chip that isn't in the list is matched as literal text in job titles.
