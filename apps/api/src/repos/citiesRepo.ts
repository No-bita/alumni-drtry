import type { DbExecutor } from "../db/types.js";
import { personIsDiscoverableAlumniSql, personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { normalizePlaceAlias } from "../lib/canonicalPlacesNormalize.js";

/** Monday 00:00 Asia/Kolkata of the current week, as a timestamptz. */
export const COFFEE_WEEK_START_SQL = `(date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;

/** The people a Cities list may show: active, named, past onboarding step 2. */
function listablePersonSql(alias: string, viewerIsDemo: boolean): string {
  return `${alias}.deleted_at IS NULL
    AND ${alias}.suspended_at IS NULL
    AND ${alias}.full_name IS NOT NULL
    AND ${alias}.profile_completed_at IS NOT NULL
    AND ${personIsDiscoverableForViewerSql(alias, viewerIsDemo)}`;
}

const OPEN_TO_SQL = (alias: string, tag: string) =>
  `(COALESCE(${alias}.open_to_preferences -> 'selected', '[]'::jsonb) ? '${tag}')`;

/** Current job (latest), department, as columns `role_title`, `org_name`, `org_main_id`, `dept_code`, `dept_name`. */
function personCardJoinsSql(alias: string): string {
  return `
    LEFT JOIN departments d_${alias} ON d_${alias}.id = ${alias}.department_id
    LEFT JOIN LATERAL (
      SELECT o.role_title, org.name::text AS org_name, COALESCE(org.canonical_organization_id, org.id) AS org_main_id
      FROM occupations o
      LEFT JOIN organizations org ON org.id = o.organization_id
      WHERE o.person_id = ${alias}.id AND o.is_current = TRUE
      ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
      LIMIT 1
    ) job_${alias} ON TRUE`;
}

function personCardColumnsSql(alias: string, prefix = ""): string {
  return `
    ${alias}.id AS ${prefix}id,
    ${alias}.full_name AS ${prefix}full_name,
    COALESCE(${alias}.batch_year, ${alias}.joining_year)::int AS ${prefix}batch_year,
    lower(COALESCE(d_${alias}.code, ${alias}.department_code)) AS ${prefix}department_code,
    COALESCE(d_${alias}.name, ${alias}.department_name) AS ${prefix}department_name,
    job_${alias}.role_title AS ${prefix}role_title,
    job_${alias}.org_name AS ${prefix}org_name`;
}

/** A person is due a nudge: never sent, or not yet this week (weekly) / in the last 28 days (monthly). */
const NUDGE_DUE_SQL = (alias: string) => `(
  ${alias}.city_nudge_last_sent_at IS NULL
  OR (${alias}.city_nudge_frequency = 'weekly' AND ${alias}.city_nudge_last_sent_at < ${COFFEE_WEEK_START_SQL})
  OR (${alias}.city_nudge_frequency = 'monthly' AND ${alias}.city_nudge_last_sent_at < now() - interval '28 days')
)`;

export interface PersonCardRow {
  id: string;
  full_name: string;
  batch_year: number | null;
  department_code: string | null;
  department_name: string | null;
  role_title: string | null;
  org_name: string | null;
}

export interface PlaceRow {
  id: string;
  city: string;
  country: string;
}

export interface CityCountRow extends PlaceRow {
  count: number;
}

export interface ResidenceState {
  placeId: string | null;
  changedAt: Date | null;
  previousPlaceId: string | null;
  city: string | null;
  country: string | null;
}

export interface ViewerFacts {
  batchYear: number | null;
  departmentCode: string | null;
  companyMainId: string | null;
  companyName: string | null;
}

export interface ArrivalRow {
  id: string;
  person_id: string;
  place_id: string;
  previous_place_id: string | null;
  opted_in_at: Date;
  visible_until: Date;
  ended_at: Date | null;
  ended_reason: string | null;
}

export interface ArrivalListRow extends PersonCardRow {
  arrival_id: string;
  opted_in_at: Date;
  previous_city: string | null;
  my_offer_id: string | null;
  wrote_note_id: string | null;
  wrote_note_status: "pending" | "accepted" | "declined" | null;
}

export interface OfferListRow extends PersonCardRow {
  offer_id: string;
  kinds: string[];
  line: string | null;
  created_at: Date;
  seen_at: Date | null;
  note_id: string | null;
  note_status: "pending" | "accepted" | "declined" | null;
}

export interface CityAlumRow extends PersonCardRow {
  open_to_preferences: unknown;
  batch_near: boolean;
  same_dept: boolean;
  same_company: boolean | null;
}

export type CityAlumniFilter = "batch" | "department" | "company" | "coffee" | "shared" | "all";

export interface CityPostRow {
  id: string;
  author_person_id: string;
  author_full_name: string;
  author_batch_year: number | null;
  content: string;
  created_at: Date;
  viewer_has_responded: boolean;
}

export interface OfferNotificationRow {
  offer_id: string;
  created_at: Date;
  offerer_person_id: string;
  offerer_full_name: string | null;
  kinds: string[];
  city: string;
}

export interface NudgeRecipientRow {
  id: string;
  institutional_email: string;
  full_name: string | null;
  place_id: string;
  city: string;
  frequency: "weekly" | "monthly";
  last_sent_at: Date | null;
  city_help_on: boolean;
}

export class CitiesRepo {
  constructor(private readonly db: DbExecutor) {}

  /* ------------------------------------------------------------------ */
  /* Places                                                              */
  /* ------------------------------------------------------------------ */

  async placeById(placeId: string): Promise<PlaceRow | null> {
    const r = await this.db.query<PlaceRow>(
      `SELECT id, city_label AS city, country FROM canonical_places WHERE id = $1::uuid`,
      [placeId]
    );
    return r.rows[0] ?? null;
  }

  /** Bengaluru, India by its label or a known spelling (the default Cities v1 city). */
  async findPlaceByName(city: string, country: string | null): Promise<PlaceRow | null> {
    const norm = normalizePlaceAlias(city);
    if (!norm) return null;
    const r = await this.db.query<PlaceRow>(
      `
      SELECT cp.id, cp.city_label AS city, cp.country
      FROM canonical_places cp
      WHERE ($2::text IS NULL OR lower(btrim(cp.country)) = lower(btrim($2)))
        AND (
          lower(regexp_replace(btrim(cp.city_label), '\\s+', ' ', 'g')) = $1
          OR EXISTS (SELECT 1 FROM place_aliases pa WHERE pa.canonical_place_id = cp.id AND pa.alias_normalized = $1)
        )
      ORDER BY (lower(regexp_replace(btrim(cp.city_label), '\\s+', ' ', 'g')) = $1) DESC, cp.created_at ASC
      LIMIT 1
      `,
      [norm, country?.trim() ? country.trim() : null]
    );
    return r.rows[0] ?? null;
  }

  /** Spelling names for a place: its label plus aliases, lowercased. */
  async placeNames(placeId: string): Promise<string[]> {
    const r = await this.db.query<{ n: string }>(
      `SELECT lower(btrim(city_label)) AS n FROM canonical_places WHERE id = $1::uuid
       UNION SELECT alias_normalized FROM place_aliases WHERE canonical_place_id = $1::uuid`,
      [placeId]
    );
    return r.rows.map((x) => x.n);
  }

  /** Canonical places with listed alumni, most first (plus `includePlaceId` even when empty). */
  async listCities(viewerIsDemo: boolean, limit: number, includePlaceId: string | null): Promise<CityCountRow[]> {
    const r = await this.db.query<{ id: string; city: string; country: string; count: number }>(
      `
      SELECT cp.id, cp.city_label AS city, cp.country, COUNT(p.id)::int AS count
      FROM canonical_places cp
      LEFT JOIN people p ON p.residence_canonical_place_id = cp.id AND ${listablePersonSql("p", viewerIsDemo)}
      GROUP BY cp.id
      HAVING COUNT(p.id) > 0 OR cp.id = $2::uuid
      ORDER BY COUNT(p.id) DESC, cp.city_label ASC
      LIMIT $1
      `,
      [limit, includePlaceId]
    );
    return r.rows;
  }

  async searchPlaces(q: string, limit: number): Promise<PlaceRow[]> {
    const norm = normalizePlaceAlias(q);
    if (!norm) return [];
    const r = await this.db.query<PlaceRow>(
      `
      SELECT cp.id, cp.city_label AS city, cp.country
      FROM canonical_places cp
      WHERE strpos(lower(cp.city_label), $1) = 1
         OR EXISTS (SELECT 1 FROM place_aliases pa WHERE pa.canonical_place_id = cp.id AND strpos(pa.alias_normalized, $1) = 1)
      ORDER BY (lower(cp.city_label) = $1) DESC,
               (SELECT COUNT(*) FROM people p WHERE p.residence_canonical_place_id = cp.id AND p.deleted_at IS NULL) DESC,
               cp.city_label ASC
      LIMIT $2
      `,
      [norm, limit]
    );
    return r.rows;
  }

  async countAlumni(placeId: string, viewerIsDemo: boolean): Promise<{ alumni: number; cityHelp: number }> {
    const r = await this.db.query<{ alumni: number; city_help: number }>(
      `SELECT COUNT(*)::int AS alumni, COUNT(*) FILTER (WHERE ${OPEN_TO_SQL("p", "city_help")})::int AS city_help
       FROM people p WHERE p.residence_canonical_place_id = $1::uuid AND ${listablePersonSql("p", viewerIsDemo)}`,
      [placeId]
    );
    return { alumni: r.rows[0]?.alumni ?? 0, cityHelp: r.rows[0]?.city_help ?? 0 };
  }

  async countAlumniInCountry(country: string, viewerIsDemo: boolean): Promise<number> {
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM people p
       JOIN canonical_places cp ON cp.id = p.residence_canonical_place_id
       WHERE lower(btrim(cp.country)) = lower(btrim($1)) AND ${listablePersonSql("p", viewerIsDemo)}`,
      [country]
    );
    return r.rows[0]?.c ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /* Residence                                                           */
  /* ------------------------------------------------------------------ */

  async residence(personId: string): Promise<ResidenceState | null> {
    const r = await this.db.query<{
      place_id: string | null;
      changed_at: Date | null;
      previous_place_id: string | null;
      residence_city: string | null;
      residence_country: string | null;
    }>(
      `SELECT residence_canonical_place_id AS place_id, residence_changed_at AS changed_at,
              residence_previous_place_id AS previous_place_id, residence_city, residence_country
       FROM people WHERE id = $1`,
      [personId]
    );
    const row = r.rows[0];
    return row
      ? {
          placeId: row.place_id,
          changedAt: row.changed_at,
          previousPlaceId: row.previous_place_id,
          city: row.residence_city,
          country: row.residence_country
        }
      : null;
  }

  /** Point the profile at a place. `moved` also records when and from where (a move between two places). */
  async setResidencePlace(personId: string, placeId: string | null, moved: { from: string } | null): Promise<void> {
    if (moved) {
      await this.db.query(
        `UPDATE people SET residence_canonical_place_id = $2::uuid, residence_changed_at = now(), residence_previous_place_id = $3::uuid
         WHERE id = $1`,
        [personId, placeId, moved.from]
      );
    } else {
      await this.db.query(`UPDATE people SET residence_canonical_place_id = $2::uuid WHERE id = $1`, [personId, placeId]);
    }
  }

  async viewerFacts(personId: string): Promise<ViewerFacts> {
    const r = await this.db.query<{
      batch_year: number | null;
      department_code: string | null;
      org_main_id: string | null;
      org_name: string | null;
    }>(
      `SELECT COALESCE(v.batch_year, v.joining_year)::int AS batch_year,
              lower(COALESCE(d_v.code, v.department_code)) AS department_code,
              job_v.org_main_id, COALESCE(main.name::text, job_v.org_name) AS org_name
       FROM people v
       ${personCardJoinsSql("v")}
       LEFT JOIN organizations main ON main.id = job_v.org_main_id
       WHERE v.id = $1`,
      [personId]
    );
    const row = r.rows[0];
    return {
      batchYear: row?.batch_year ?? null,
      departmentCode: row?.department_code ?? null,
      companyMainId: row?.org_main_id ?? null,
      companyName: row?.org_name ?? null
    };
  }

  async personCard(personId: string): Promise<PersonCardRow | null> {
    const r = await this.db.query<PersonCardRow>(
      `SELECT ${personCardColumnsSql("p")} FROM people p ${personCardJoinsSql("p")} WHERE p.id = $1`,
      [personId]
    );
    return r.rows[0] ?? null;
  }

  async openToPreferences(personIds: readonly string[]): Promise<Map<string, unknown>> {
    if (personIds.length === 0) return new Map();
    const r = await this.db.query<{ id: string; open_to_preferences: unknown }>(
      `SELECT id, open_to_preferences FROM people WHERE id = ANY($1::uuid[])`,
      [[...personIds]]
    );
    return new Map(r.rows.map((x) => [x.id, x.open_to_preferences]));
  }

  /** Locks the person's row until the transaction ends (coffee limit, pending-ask limit). */
  async lockPerson(personId: string): Promise<void> {
    await this.db.query(`SELECT id FROM people WHERE id = $1 FOR UPDATE`, [personId]);
  }

  /* ------------------------------------------------------------------ */
  /* Arrivals                                                            */
  /* ------------------------------------------------------------------ */

  async activeArrival(personId: string): Promise<ArrivalRow | null> {
    const r = await this.db.query<ArrivalRow>(
      `SELECT * FROM city_arrivals WHERE person_id = $1 AND ended_at IS NULL AND now() < visible_until LIMIT 1`,
      [personId]
    );
    return r.rows[0] ?? null;
  }

  /** The person's arrival (active or stopped) whose 30 days are not over, newest first. */
  async recentArrival(personId: string, placeId: string): Promise<ArrivalRow | null> {
    const r = await this.db.query<ArrivalRow>(
      `SELECT * FROM city_arrivals WHERE person_id = $1 AND place_id = $2 AND now() < visible_until
       ORDER BY opted_in_at DESC LIMIT 1`,
      [personId, placeId]
    );
    return r.rows[0] ?? null;
  }

  async arrivalById(arrivalId: string): Promise<ArrivalRow | null> {
    const r = await this.db.query<ArrivalRow>(`SELECT * FROM city_arrivals WHERE id = $1`, [arrivalId]);
    return r.rows[0] ?? null;
  }

  /** True when an arrival was created at or after `since` (the opt-in for the latest move). */
  async hasArrivalSince(personId: string, since: Date): Promise<boolean> {
    const r = await this.db.query(`SELECT 1 FROM city_arrivals WHERE person_id = $1 AND opted_in_at >= $2 LIMIT 1`, [
      personId,
      since
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async createArrival(personId: string, placeId: string, previousPlaceId: string | null, windowDays: number): Promise<ArrivalRow> {
    const r = await this.db.query<ArrivalRow>(
      `INSERT INTO city_arrivals (person_id, place_id, previous_place_id, visible_until)
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 day'))
       RETURNING *`,
      [personId, placeId, previousPlaceId, windowDays]
    );
    return r.rows[0]!;
  }

  /** End the person's open arrival row (also closes one whose window passed). Returns true when one ended. */
  async endArrival(personId: string, reason: "stopped" | "moved" | "expired"): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE city_arrivals SET ended_at = now(),
         ended_reason = CASE WHEN $2 <> 'expired' AND now() >= visible_until THEN 'expired' ELSE $2 END
       WHERE person_id = $1 AND ended_at IS NULL`,
      [personId, reason]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Active arrivals in a city for a local, newest first. Leaves out the viewer, people not listable for
   * them, and newcomers who have declined a note from the viewer before.
   */
  async listActiveArrivals(placeId: string, viewerPersonId: string, viewerIsDemo: boolean, limit: number): Promise<{ total: number; rows: ArrivalListRow[] }> {
    const where = `
      a.place_id = $1::uuid AND a.ended_at IS NULL AND now() < a.visible_until
      AND a.person_id <> $2::uuid
      AND ${listablePersonSql("p", viewerIsDemo)}
      AND NOT EXISTS (
        SELECT 1 FROM contact_requests cr
        WHERE cr.sender_person_id = $2::uuid AND cr.recipient_person_id = a.person_id AND cr.status = 'declined'
      )`;
    const [rows, total] = await Promise.all([
      this.db.query<ArrivalListRow>(
        `
        SELECT ${personCardColumnsSql("p")},
               a.id AS arrival_id, a.opted_in_at, prev.city_label AS previous_city,
               mine.id AS my_offer_id,
               note.id AS wrote_note_id, note.status AS wrote_note_status
        FROM city_arrivals a
        JOIN people p ON p.id = a.person_id
        ${personCardJoinsSql("p")}
        LEFT JOIN canonical_places prev ON prev.id = a.previous_place_id
        LEFT JOIN city_help_offers mine
          ON mine.arrival_id = a.id AND mine.offerer_person_id = $2::uuid AND mine.withdrawn_at IS NULL
        LEFT JOIN LATERAL (
          SELECT cr.id, cr.status FROM contact_requests cr
          WHERE cr.city_help_offer_id = mine.id AND cr.sender_person_id = a.person_id
          ORDER BY cr.created_at DESC LIMIT 1
        ) note ON TRUE
        WHERE ${where}
        ORDER BY a.opted_in_at DESC
        LIMIT $3
        `,
        [placeId, viewerPersonId, limit]
      ),
      this.db.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM city_arrivals a JOIN people p ON p.id = a.person_id WHERE ${where}`,
        [placeId, viewerPersonId]
      )
    ]);
    return { total: total.rows[0]?.c ?? 0, rows: rows.rows };
  }

  /** Active arrivals in a place since a moment (nudge email). */
  async arrivalsSince(placeId: string, since: Date | null, limit: number): Promise<Array<PersonCardRow & { previous_city: string | null }>> {
    const r = await this.db.query<PersonCardRow & { previous_city: string | null }>(
      `
      SELECT ${personCardColumnsSql("p")}, prev.city_label AS previous_city
      FROM city_arrivals a
      JOIN people p ON p.id = a.person_id
      ${personCardJoinsSql("p")}
      LEFT JOIN canonical_places prev ON prev.id = a.previous_place_id
      WHERE a.place_id = $1::uuid AND a.ended_at IS NULL AND now() < a.visible_until
        AND ($2::timestamptz IS NULL OR a.opted_in_at > $2)
        AND ${listablePersonSql("p", false)}
      ORDER BY a.opted_in_at DESC
      LIMIT $3
      `,
      [placeId, since, limit]
    );
    return r.rows;
  }

  /* ------------------------------------------------------------------ */
  /* Offers                                                              */
  /* ------------------------------------------------------------------ */

  async createOffer(arrivalId: string, offererPersonId: string, kinds: string[], line: string | null): Promise<{ id: string } | null> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO city_help_offers (arrival_id, offerer_person_id, kinds, line)
       VALUES ($1, $2, $3::text[], $4)
       ON CONFLICT (arrival_id, offerer_person_id) DO NOTHING
       RETURNING id`,
      [arrivalId, offererPersonId, kinds, line]
    );
    return r.rows[0] ?? null;
  }

  async withdrawOffer(offerId: string, offererPersonId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE city_help_offers SET withdrawn_at = now()
       WHERE id = $1 AND offerer_person_id = $2 AND withdrawn_at IS NULL`,
      [offerId, offererPersonId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async offerById(offerId: string): Promise<{ id: string; arrival_id: string; offerer_person_id: string; withdrawn_at: Date | null; arrival_person_id: string; kinds: string[] } | null> {
    const r = await this.db.query<{ id: string; arrival_id: string; offerer_person_id: string; withdrawn_at: Date | null; arrival_person_id: string; kinds: string[] }>(
      `SELECT o.id, o.arrival_id, o.offerer_person_id, o.withdrawn_at, a.person_id AS arrival_person_id, o.kinds
       FROM city_help_offers o JOIN city_arrivals a ON a.id = o.arrival_id WHERE o.id = $1`,
      [offerId]
    );
    return r.rows[0] ?? null;
  }

  /** Offers on an arrival (not withdrawn), newest first, with the newcomer's note to each offerer. */
  async listOffers(arrivalId: string): Promise<OfferListRow[]> {
    const r = await this.db.query<OfferListRow>(
      `
      SELECT ${personCardColumnsSql("p")},
             o.id AS offer_id, o.kinds, o.line, o.created_at, o.seen_at,
             note.id AS note_id, note.status AS note_status
      FROM city_help_offers o
      JOIN city_arrivals a ON a.id = o.arrival_id
      JOIN people p ON p.id = o.offerer_person_id
      ${personCardJoinsSql("p")}
      LEFT JOIN LATERAL (
        SELECT cr.id, cr.status FROM contact_requests cr
        WHERE cr.city_help_offer_id = o.id AND cr.sender_person_id = a.person_id
        ORDER BY cr.created_at DESC LIMIT 1
      ) note ON TRUE
      WHERE o.arrival_id = $1 AND o.withdrawn_at IS NULL
        AND p.deleted_at IS NULL AND p.suspended_at IS NULL
      ORDER BY o.created_at DESC
      `,
      [arrivalId]
    );
    return r.rows;
  }

  async markOffersSeen(personId: string): Promise<void> {
    await this.db.query(
      `UPDATE city_help_offers o SET seen_at = now()
       FROM city_arrivals a
       WHERE a.id = o.arrival_id AND a.person_id = $1 AND o.seen_at IS NULL AND o.withdrawn_at IS NULL`,
      [personId]
    );
  }

  /** In-app notifications for a newcomer: every offer on their arrivals (not withdrawn). */
  async offerNotifications(personId: string, limit: number): Promise<OfferNotificationRow[]> {
    const r = await this.db.query<OfferNotificationRow>(
      `SELECT o.id AS offer_id, o.created_at, o.offerer_person_id, p.full_name AS offerer_full_name, o.kinds, cp.city_label AS city
       FROM city_help_offers o
       JOIN city_arrivals a ON a.id = o.arrival_id
       JOIN canonical_places cp ON cp.id = a.place_id
       JOIN people p ON p.id = o.offerer_person_id
       WHERE a.person_id = $1 AND o.withdrawn_at IS NULL AND p.deleted_at IS NULL AND p.suspended_at IS NULL
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [personId, limit]
    );
    return r.rows;
  }

  async countOfferNotifications(personId: string): Promise<number> {
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM city_help_offers o
       JOIN city_arrivals a ON a.id = o.arrival_id
       JOIN people p ON p.id = o.offerer_person_id
       WHERE a.person_id = $1 AND o.withdrawn_at IS NULL AND p.deleted_at IS NULL AND p.suspended_at IS NULL`,
      [personId]
    );
    return r.rows[0]?.c ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /* Coffee and city-help asks                                           */
  /* ------------------------------------------------------------------ */

  /** Coffee asks each recipient got this week (any status: a declined ask still used a spot). */
  async coffeeAsksThisWeek(recipientIds: readonly string[]): Promise<Map<string, number>> {
    if (recipientIds.length === 0) return new Map();
    const r = await this.db.query<{ recipient_person_id: string; c: number }>(
      `SELECT recipient_person_id, COUNT(*)::int AS c FROM contact_requests
       WHERE recipient_person_id = ANY($1::uuid[]) AND source = 'cities' AND source_category = 'coffee'
         AND created_at >= ${COFFEE_WEEK_START_SQL}
       GROUP BY recipient_person_id`,
      [[...recipientIds]]
    );
    return new Map(r.rows.map((x) => [x.recipient_person_id, x.c]));
  }

  /** Recipients the sender has a pending coffee ask to. */
  async pendingCoffeeAsksFrom(senderId: string, recipientIds: readonly string[]): Promise<Set<string>> {
    if (recipientIds.length === 0) return new Set();
    const r = await this.db.query<{ recipient_person_id: string }>(
      `SELECT DISTINCT recipient_person_id FROM contact_requests
       WHERE sender_person_id = $1 AND recipient_person_id = ANY($2::uuid[])
         AND source = 'cities' AND source_category = 'coffee' AND status = 'pending'`,
      [senderId, [...recipientIds]]
    );
    return new Set(r.rows.map((x) => x.recipient_person_id));
  }

  /** Latest relocation/visiting ask from the sender to each recipient. */
  async latestCityAsksFrom(senderId: string, recipientIds: readonly string[]): Promise<Map<string, { status: "pending" | "accepted" | "declined"; createdAt: Date }>> {
    if (recipientIds.length === 0) return new Map();
    const r = await this.db.query<{ recipient_person_id: string; status: "pending" | "accepted" | "declined"; created_at: Date }>(
      `SELECT DISTINCT ON (recipient_person_id) recipient_person_id, status, created_at FROM contact_requests
       WHERE sender_person_id = $1 AND recipient_person_id = ANY($2::uuid[])
         AND source = 'cities' AND source_category IN ('relocation', 'visiting')
       ORDER BY recipient_person_id, created_at DESC`,
      [senderId, [...recipientIds]]
    );
    return new Map(r.rows.map((x) => [x.recipient_person_id, { status: x.status, createdAt: x.created_at }]));
  }

  async pendingCityHelpAsks(senderId: string): Promise<number> {
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM contact_requests
       WHERE sender_person_id = $1 AND source = 'cities' AND source_category IN ('relocation', 'visiting') AND status = 'pending'`,
      [senderId]
    );
    return r.rows[0]?.c ?? 0;
  }

  async pendingNotesFor(personId: string): Promise<number> {
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM contact_requests WHERE recipient_person_id = $1 AND status = 'pending'`,
      [personId]
    );
    return r.rows[0]?.c ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /* Alumni in a city                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Alumni living in a place, sorted by what they share with the viewer (batch window, department,
   * current company), then name.
   */
  async listCityAlumni(input: {
    placeId: string;
    viewerPersonId: string;
    viewerIsDemo: boolean;
    viewer: ViewerFacts;
    batchWindow: number;
    filter: CityAlumniFilter;
    excludeIds?: readonly string[];
    offset: number;
    limit: number;
  }): Promise<{ total: number; rows: CityAlumRow[] }> {
    const params: unknown[] = [
      input.placeId,
      input.viewerPersonId,
      input.viewer.batchYear,
      input.batchWindow,
      input.viewer.departmentCode,
      input.viewer.companyMainId,
      [...(input.excludeIds ?? [])]
    ];
    const filterSql: Record<CityAlumniFilter, string> = {
      batch: "batch_near",
      department: "same_dept",
      company: "same_company",
      coffee: "open_coffee",
      shared: "(batch_near OR same_dept OR same_company)",
      all: "TRUE"
    };
    const base = `
      WITH alumni AS (
        SELECT ${personCardColumnsSql("p")},
               p.open_to_preferences,
               ($3::int IS NOT NULL AND COALESCE(p.batch_year, p.joining_year) IS NOT NULL
                 AND abs(COALESCE(p.batch_year, p.joining_year) - $3::int) <= $4::int) AS batch_near,
               ($5::text IS NOT NULL AND lower(COALESCE(d_p.code, p.department_code)) = $5::text) AS same_dept,
               ($6::uuid IS NOT NULL AND job_p.org_main_id = $6::uuid) AS same_company,
               ${OPEN_TO_SQL("p", "coffee")} AS open_coffee
        FROM people p
        ${personCardJoinsSql("p")}
        WHERE p.residence_canonical_place_id = $1::uuid
          AND p.id <> $2::uuid
          AND NOT (p.id = ANY($7::uuid[]))
          AND ${listablePersonSql("p", input.viewerIsDemo)}
      )`;
    const [rows, total] = await Promise.all([
      this.db.query<CityAlumRow>(
        `${base}
         SELECT * FROM alumni WHERE ${filterSql[input.filter]}
         ORDER BY batch_near DESC, same_dept DESC, same_company DESC, lower(full_name) ASC, id ASC
         OFFSET $8 LIMIT $9`,
        [...params, input.offset, input.limit]
      ),
      this.db.query<{ c: number }>(`${base} SELECT COUNT(*)::int AS c FROM alumni WHERE ${filterSql[input.filter]}`, params)
    ]);
    return { total: total.rows[0]?.c ?? 0, rows: rows.rows };
  }

  /** People in a place who are open to city help (ids only). */
  async cityHelperIds(placeId: string, viewerPersonId: string, viewerIsDemo: boolean): Promise<Set<string>> {
    const r = await this.db.query<{ id: string }>(
      `SELECT p.id FROM people p
       WHERE p.residence_canonical_place_id = $1::uuid AND p.id <> $2::uuid
         AND ${OPEN_TO_SQL("p", "city_help")} AND ${listablePersonSql("p", viewerIsDemo)}`,
      [placeId, viewerPersonId]
    );
    return new Set(r.rows.map((x) => x.id));
  }

  async personCards(personIds: readonly string[]): Promise<Map<string, CityAlumRow>> {
    if (personIds.length === 0) return new Map();
    const r = await this.db.query<CityAlumRow>(
      `SELECT ${personCardColumnsSql("p")}, p.open_to_preferences, FALSE AS batch_near, FALSE AS same_dept, NULL::boolean AS same_company
       FROM people p ${personCardJoinsSql("p")} WHERE p.id = ANY($1::uuid[])`,
      [[...personIds]]
    );
    return new Map(r.rows.map((x) => [x.id, x]));
  }

  /* ------------------------------------------------------------------ */
  /* Explicit relocation searches (not page views or unique people)                           */
  /* ------------------------------------------------------------------ */

  async askCount(cityNames: readonly string[], country: string, days: number): Promise<number> {
    if (cityNames.length === 0) return 0;
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM match_queries
       WHERE created_at >= now() - ($2::int * interval '1 day')
         AND parser_source IN ('rules', 'llm')
         AND category = 'relocation'
         AND lower(btrim(city)) = ANY($1::text[])
         AND lower(btrim(country)) = lower(btrim($3::text))`,
      [[...cityNames], days, country]
    );
    return r.rows[0]?.c ?? 0;
  }

  /** Claims today's demand key; false when this viewer already counted for this city today. */
  async claimDemandKey(keyHash: string): Promise<boolean> {
    const r = await this.db.query(
      `INSERT INTO city_demand_view_keys (key_hash) VALUES ($1) ON CONFLICT (key_hash) DO NOTHING`,
      [keyHash]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async purgeDemandKeys(): Promise<void> {
    // Retain deduplication history. No demand-key deletion is approved.
  }

  /* ------------------------------------------------------------------ */
  /* Wall posts tagged with a city                                       */
  /* ------------------------------------------------------------------ */

  async cityPosts(placeId: string, viewerPersonId: string, viewerIsDemo: boolean, limit: number, since: Date | null = null): Promise<CityPostRow[]> {
    const r = await this.db.query<CityPostRow>(
      `
      SELECT i.id, i.author_person_id, p.full_name AS author_full_name,
             COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year, i.content, i.created_at,
             EXISTS (SELECT 1 FROM intentcast_responses r WHERE r.intentcast_id = i.id AND r.responder_person_id = $2::uuid) AS viewer_has_responded
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      WHERE i.place_id = $1::uuid AND i.status = 'open' AND i.expires_at > now()
        AND i.author_soft_deleted_at IS NULL
        AND p.deleted_at IS NULL AND p.suspended_at IS NULL AND p.full_name IS NOT NULL
        AND (${personIsDiscoverableForViewerSql("p", viewerIsDemo)} OR p.id = $2::uuid)
        AND ($4::timestamptz IS NULL OR i.created_at > $4)
      ORDER BY i.created_at DESC
      LIMIT $3
      `,
      [placeId, viewerPersonId, limit, since]
    );
    return r.rows;
  }

  /* ------------------------------------------------------------------ */
  /* Nudge email                                                         */
  /* ------------------------------------------------------------------ */

  async nudgeFrequency(personId: string): Promise<"weekly" | "monthly" | "never"> {
    const r = await this.db.query<{ f: "weekly" | "monthly" | "never" }>(`SELECT city_nudge_frequency AS f FROM people WHERE id = $1`, [personId]);
    return r.rows[0]?.f ?? "weekly";
  }

  async setNudgeFrequency(personId: string, frequency: "weekly" | "monthly" | "never"): Promise<void> {
    await this.db.query(`UPDATE people SET city_nudge_frequency = $2 WHERE id = $1`, [personId, frequency]);
  }

  /**
   * Locals in the given places who are due a nudge: weekly → nothing sent since this week began;
   * monthly → nothing sent in the last 28 days. Real alumni only.
   */
  async nudgeRecipients(placeIds: readonly string[], limit: number): Promise<NudgeRecipientRow[]> {
    if (placeIds.length === 0) return [];
    const r = await this.db.query<NudgeRecipientRow>(
      `
      SELECT p.id, p.institutional_email::text AS institutional_email, p.full_name, p.residence_canonical_place_id AS place_id,
             cp.city_label AS city, p.city_nudge_frequency AS frequency, p.city_nudge_last_sent_at AS last_sent_at,
             ${OPEN_TO_SQL("p", "city_help")} AS city_help_on
      FROM people p
      JOIN canonical_places cp ON cp.id = p.residence_canonical_place_id
      WHERE p.residence_canonical_place_id = ANY($1::uuid[])
        AND p.city_nudge_frequency <> 'never'
        AND p.deleted_at IS NULL AND p.suspended_at IS NULL AND p.full_name IS NOT NULL
        AND p.profile_completed_at IS NOT NULL
        AND ${personIsDiscoverableAlumniSql("p")}
        AND NOT p.is_demo
        AND ${NUDGE_DUE_SQL("p")}
      ORDER BY p.id
      LIMIT $2
      `,
      [[...placeIds], limit]
    );
    return r.rows;
  }

  /** Claim this week's nudge for a person: only while still due, so two replicas can't both send it. */
  async claimNudge(personId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE people p SET city_nudge_last_sent_at = now()
       WHERE p.id = $1 AND p.city_nudge_frequency <> 'never' AND ${NUDGE_DUE_SQL("p")}`,
      [personId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async releaseNudge(personId: string, previous: Date | null): Promise<void> {
    await this.db.query(`UPDATE people SET city_nudge_last_sent_at = $2::timestamptz WHERE id = $1`, [personId, previous]);
  }
  }
