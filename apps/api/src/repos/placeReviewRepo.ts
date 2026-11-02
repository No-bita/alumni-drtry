import type { DbExecutor } from "../db/types.js";
import { normalizePlaceAlias } from "../lib/canonicalPlacesNormalize.js";

export type PlaceStatus = "pending" | "approved" | "rejected" | "combined";
export type PlaceHistoryAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "reopened"
  | "combined"
  | "renamed"
  | "alias_added"
  | "alias_removed";

export interface ReviewPlaceRow {
  id: string;
  city: string;
  country: string;
  status: PlaceStatus;
  combined_into_place_id: string | null;
  submitted_by_person_id: string | null;
  submitted_at: Date | null;
  reviewed_by_person_id: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
}

export interface QueueRow extends ReviewPlaceRow {
  linked_members: number;
  submitted_by_email: string | null;
  aliases: string[];
}

export interface HistoryRow {
  id: string;
  place_id: string;
  place_city: string;
  place_country: string;
  action: PlaceHistoryAction;
  actor_person_id: string | null;
  actor_name: string | null;
  target_place_id: string | null;
  target_city: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
}

const PLACE_COLUMNS = `cp.id, cp.city_label AS city, cp.country, cp.status, cp.combined_into_place_id,
  cp.submitted_by_person_id, cp.submitted_at, cp.reviewed_by_person_id, cp.reviewed_at, cp.rejection_reason`;

/** Same normalisation the label lookups use: lowercase, trimmed, single spaces. */
const LABEL_NORM_SQL = (col: string) => `lower(regexp_replace(btrim(${col}), '\\s+', ' ', 'g'))`;

/** Members who count anywhere (same rules as the directory). */
const LISTED_PERSON_SQL = `p.deleted_at IS NULL AND p.suspended_at IS NULL AND p.full_name IS NOT NULL AND p.profile_completed_at IS NOT NULL`;

/** SQL for every place reference that safe combining moves (keep in step with migrations). */
export const PLACE_REFERENCES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "people", column: "residence_canonical_place_id" },
  { table: "people", column: "residence_previous_place_id" },
  { table: "city_arrivals", column: "place_id" },
  { table: "city_arrivals", column: "previous_place_id" },
  { table: "intentcasts", column: "place_id" }
];

/** City review: every query takes the executor it is given, so a service can run them in one transaction. */
export class PlaceReviewRepo {
  constructor(private readonly db: DbExecutor) {}

  async byId(id: string): Promise<ReviewPlaceRow | null> {
    const r = await this.db.query<ReviewPlaceRow>(`SELECT ${PLACE_COLUMNS} FROM canonical_places cp WHERE cp.id = $1::uuid`, [id]);
    return r.rows[0] ?? null;
  }

  /** Lock rows for a change (ids in a fixed order so two admins can't deadlock). */
  async lock(ids: string[]): Promise<Map<string, ReviewPlaceRow>> {
    const sorted = [...new Set(ids)].sort();
    const r = await this.db.query<ReviewPlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM canonical_places cp WHERE cp.id = ANY($1::uuid[]) ORDER BY cp.id FOR UPDATE`,
      [sorted]
    );
    return new Map(r.rows.map((row) => [row.id, row]));
  }

  /**
   * A typed city inside one country (any of its spellings): label first, then a known spelling; among
   * equals, an approved city first. Any status, so the caller can apply the rules.
   */
  async findInCountry(city: string, countryKeys: string[]): Promise<ReviewPlaceRow | null> {
    const norm = normalizePlaceAlias(city);
    if (!norm || countryKeys.length === 0) return null;
    const r = await this.db.query<ReviewPlaceRow>(
      `
      SELECT ${PLACE_COLUMNS}
      FROM canonical_places cp
      WHERE lower(btrim(cp.country)) = ANY($2::text[])
        AND (
          ${LABEL_NORM_SQL("cp.city_label")} = $1
          OR EXISTS (SELECT 1 FROM place_aliases pa WHERE pa.canonical_place_id = cp.id AND pa.alias_normalized = $1)
        )
      ORDER BY (${LABEL_NORM_SQL("cp.city_label")} = $1) DESC,
               CASE cp.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 WHEN 'combined' THEN 2 ELSE 3 END,
               cp.created_at ASC
      LIMIT 1
      `,
      [norm, countryKeys]
    );
    return r.rows[0] ?? null;
  }

  /** Follow a combined city to the city it now points at (chains are repointed, so this is one hop; capped anyway). */
  async final(place: ReviewPlaceRow): Promise<ReviewPlaceRow | null> {
    let current: ReviewPlaceRow | null = place;
    for (let hop = 0; hop < 5 && current && current.status === "combined" && current.combined_into_place_id; hop += 1) {
      current = await this.byId(current.combined_into_place_id);
    }
    return current && current.status !== "combined" ? current : null;
  }

  /** New pending city. Two people submitting at once: the unique index lets one in; null means it already exists. */
  async insertPending(city: string, country: string, personId: string): Promise<ReviewPlaceRow | null> {
    const r = await this.db.query<ReviewPlaceRow>(
      `
      INSERT INTO canonical_places AS cp (country, city_label, status, submitted_by_person_id, submitted_at)
      VALUES ($1, $2, 'pending', $3::uuid, now())
      ON CONFLICT ((lower(trim(country))), (lower(trim(city_label)))) DO NOTHING
      RETURNING ${PLACE_COLUMNS}
      `,
      [country, city, personId]
    );
    return r.rows[0] ?? null;
  }

  /** New approved city created by an admin. */
  async insertApproved(city: string, country: string, actorPersonId: string | null): Promise<ReviewPlaceRow | null> {
    const r = await this.db.query<ReviewPlaceRow>(
      `
      INSERT INTO canonical_places AS cp (country, city_label, status, submitted_by_person_id, submitted_at, reviewed_by_person_id, reviewed_at)
      VALUES ($1, $2, 'approved', $3::uuid, now(), $3::uuid, now())
      ON CONFLICT ((lower(trim(country))), (lower(trim(city_label)))) DO NOTHING
      RETURNING ${PLACE_COLUMNS}
      `,
      [country, city, actorPersonId]
    );
    return r.rows[0] ?? null;
  }

  async byExactKey(city: string, country: string): Promise<ReviewPlaceRow | null> {
    const r = await this.db.query<ReviewPlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM canonical_places cp
       WHERE lower(trim(cp.country)) = lower(trim($1)) AND lower(trim(cp.city_label)) = lower(trim($2))`,
      [country, city]
    );
    return r.rows[0] ?? null;
  }

  async countSubmittedSince(personId: string, days: number): Promise<number> {
    // Cities this member typed that were new (admin-created cities are recorded with source "admin").
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM place_history
       WHERE action = 'submitted' AND actor_person_id = $1::uuid AND detail->>'source' = 'member'
         AND created_at > now() - make_interval(days => $2::int)`,
      [personId, days]
    );
    return r.rows[0]?.c ?? 0;
  }

  /** A spelling for a place. False when it was already there. */
  async addAlias(placeId: string, raw: string): Promise<boolean> {
    const alias = normalizePlaceAlias(raw);
    if (!alias) return false;
    const r = await this.db.query(
      `INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1::uuid, $2)
       ON CONFLICT (canonical_place_id, alias_normalized) DO NOTHING`,
      [placeId, alias]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async aliases(placeId: string): Promise<string[]> {
    const r = await this.db.query<{ a: string }>(
      `SELECT alias_normalized AS a FROM place_aliases WHERE canonical_place_id = $1::uuid ORDER BY alias_normalized`,
      [placeId]
    );
    return r.rows.map((x) => x.a);
  }

  /** Copy every spelling of `fromId` onto `toId` (the originals stay). Returns the ones that were new. */
  async copyAliases(fromId: string, toId: string): Promise<string[]> {
    const r = await this.db.query<{ a: string }>(
      `INSERT INTO place_aliases (canonical_place_id, alias_normalized)
       SELECT $2::uuid, alias_normalized FROM place_aliases WHERE canonical_place_id = $1::uuid
       ON CONFLICT (canonical_place_id, alias_normalized) DO NOTHING
       RETURNING alias_normalized AS a`,
      [fromId, toId]
    );
    return r.rows.map((x) => x.a);
  }

  async insertHistory(entry: {
    placeId: string;
    action: PlaceHistoryAction;
    actorPersonId: string | null;
    targetPlaceId?: string | null;
    reason?: string | null;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO place_history (place_id, action, actor_person_id, target_place_id, reason, detail)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::jsonb)`,
      [
        entry.placeId,
        entry.action,
        entry.actorPersonId,
        entry.targetPlaceId ?? null,
        entry.reason ?? null,
        JSON.stringify(entry.detail ?? {})
      ]
    );
  }

  async setStatus(
    id: string,
    next: { status: Exclude<PlaceStatus, "combined">; reviewerId: string | null; reason?: string | null; cityLabel?: string }
  ): Promise<ReviewPlaceRow> {
    const r = await this.db.query<ReviewPlaceRow>(
      `UPDATE canonical_places cp
       SET status = $2, rejection_reason = $3, reviewed_by_person_id = $4::uuid, reviewed_at = now(),
           city_label = COALESCE($5, cp.city_label)
       WHERE cp.id = $1::uuid
       RETURNING ${PLACE_COLUMNS}`,
      [id, next.status, next.status === "rejected" ? (next.reason ?? null) : null, next.reviewerId, next.cityLabel ?? null]
    );
    return r.rows[0]!;
  }

  async rename(id: string, cityLabel: string): Promise<void> {
    await this.db.query(`UPDATE canonical_places SET city_label = $2 WHERE id = $1::uuid`, [id, cityLabel]);
  }

  /** Move every reference from one place to another. Returns how many rows moved per reference. */
  async moveReferences(fromId: string, toId: string): Promise<Record<string, number>> {
    const moved: Record<string, number> = {};
    for (const ref of PLACE_REFERENCES) {
      const r = await this.db.query(`UPDATE ${ref.table} SET ${ref.column} = $2::uuid WHERE ${ref.column} = $1::uuid`, [fromId, toId]);
      moved[`${ref.table}.${ref.column}`] = r.rowCount ?? 0;
    }
    return moved;
  }

  /** Make `fromId` a redirect to `toId`, and point anything already redirected to `fromId` straight at `toId`. */
  async markCombined(fromId: string, toId: string, actorPersonId: string | null): Promise<number> {
    const chain = await this.db.query(
      `UPDATE canonical_places SET combined_into_place_id = $2::uuid WHERE combined_into_place_id = $1::uuid`,
      [fromId, toId]
    );
    await this.db.query(
      `UPDATE canonical_places
       SET status = 'combined', combined_into_place_id = $2::uuid, rejection_reason = NULL,
           reviewed_by_person_id = $3::uuid, reviewed_at = now()
       WHERE id = $1::uuid`,
      [fromId, toId, actorPersonId]
    );
    return chain.rowCount ?? 0;
  }

  /** Link unlinked members whose typed text matches (typed text is never changed). */
  async linkUnmapped(normCountry: string, normCity: string, placeId: string): Promise<number> {
    const r = await this.db.query(
      `UPDATE people p SET residence_canonical_place_id = $3::uuid
       WHERE p.residence_canonical_place_id IS NULL AND ${LISTED_PERSON_SQL}
         AND ${LABEL_NORM_SQL("COALESCE(p.residence_country, '')")} = $1
         AND ${LABEL_NORM_SQL("COALESCE(p.residence_city, '')")} = $2`,
      [normCountry, normCity, placeId]
    );
    return r.rowCount ?? 0;
  }

  async linkedMembers(placeId: string): Promise<number> {
    const r = await this.db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM people p WHERE p.residence_canonical_place_id = $1::uuid AND ${LISTED_PERSON_SQL}`,
      [placeId]
    );
    return r.rows[0]?.c ?? 0;
  }

  async isLinked(personId: string, placeId: string): Promise<boolean> {
    const r = await this.db.query(`SELECT 1 FROM people WHERE id = $1::uuid AND residence_canonical_place_id = $2::uuid`, [
      personId,
      placeId
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  /** The review queue: pending or rejected cities, oldest first, with who typed them and how many are linked. */
  async queue(status: "pending" | "rejected", search: string, limit: number): Promise<QueueRow[]> {
    const needle = normalizePlaceAlias(search);
    const r = await this.db.query<QueueRow>(
      `
      SELECT ${PLACE_COLUMNS},
        (SELECT COUNT(*)::int FROM people p WHERE p.residence_canonical_place_id = cp.id AND ${LISTED_PERSON_SQL}) AS linked_members,
        sub.institutional_email::text AS submitted_by_email,
        COALESCE((SELECT array_agg(pa.alias_normalized ORDER BY pa.alias_normalized) FROM place_aliases pa WHERE pa.canonical_place_id = cp.id), '{}') AS aliases
      FROM canonical_places cp
      LEFT JOIN people sub ON sub.id = cp.submitted_by_person_id
      WHERE cp.status = $1
        AND ($2 = '' OR strpos(lower(cp.city_label), $2) > 0 OR strpos(lower(cp.country), $2) > 0)
      ORDER BY COALESCE(cp.submitted_at, cp.created_at) ASC, cp.id
      LIMIT $3
      `,
      [status, needle, limit]
    );
    return r.rows;
  }

  /** "Same city as…" picker: approved cities by name or spelling, optionally in one country. */
  async searchApproved(search: string, excludeId: string | null, limit: number): Promise<Array<{ id: string; city: string; country: string }>> {
    const needle = normalizePlaceAlias(search);
    const r = await this.db.query<{ id: string; city: string; country: string }>(
      `
      SELECT cp.id, cp.city_label AS city, cp.country
      FROM canonical_places cp
      WHERE cp.status = 'approved'
        AND ($2::uuid IS NULL OR cp.id <> $2::uuid)
        AND ($1 = '' OR strpos(lower(cp.city_label), $1) > 0
             OR EXISTS (SELECT 1 FROM place_aliases pa WHERE pa.canonical_place_id = cp.id AND strpos(pa.alias_normalized, $1) > 0))
      ORDER BY (lower(cp.city_label) = $1) DESC, lower(cp.city_label), cp.country, cp.id
      LIMIT $3
      `,
      [needle, excludeId, limit]
    );
    return r.rows;
  }

  async history(placeId: string | null, limit: number): Promise<HistoryRow[]> {
    const r = await this.db.query<HistoryRow>(
      `
      SELECT h.id, h.place_id, cp.city_label AS place_city, cp.country AS place_country, h.action,
             h.actor_person_id, actor.full_name AS actor_name, h.target_place_id, tgt.city_label AS target_city,
             h.reason, h.detail, h.created_at
      FROM place_history h
      JOIN canonical_places cp ON cp.id = h.place_id
      LEFT JOIN canonical_places tgt ON tgt.id = h.target_place_id
      LEFT JOIN people actor ON actor.id = h.actor_person_id
      WHERE ($1::uuid IS NULL OR h.place_id = $1::uuid OR h.target_place_id = $1::uuid)
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT $2
      `,
      [placeId, limit]
    );
    return r.rows;
  }
      }
