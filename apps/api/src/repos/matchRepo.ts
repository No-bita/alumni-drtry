import { env } from "../config/env.js";
import type { PoolExecutor } from "../db/types.js";
import { personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import type { MatchLexicon, MatchLexiconPlace, StudyProgram } from "../lib/matchIntent.js";
import type { MatchCandidateSignals, OccupationSignal } from "../lib/matchScore.js";
import { parseOpenToPreferences } from "../lib/openToPreferences.js";

/** Structured search terms derived from a `MatchIntent` by `MatchService`. */
export interface MatchCandidateQuery {
  viewerPersonId: string;
  viewerIsDemo: boolean;
  /** Escaped regex alternation of organization names (case-insensitive, word-bounded). */
  companyPattern: string | null;
  rolePattern: string | null;
  fromRolePattern: string | null;
  /** Lowercase city names/aliases that count as the asked city. */
  cityNames: string[];
  /** Lowercase country names that count as the asked country. */
  countryNames: string[];
  studyPrograms: StudyProgram[];
  wantStudy: boolean;
  wantFounder: boolean;
  /** Display keyword + escaped pattern pairs. */
  keywords: { keyword: string; pattern: string }[];
  /** Max candidate rows to score in TS. */
  candidateLimit: number;
  /**
   * A row is fetched only if it has at least one of these signals. Mirrors
   * `primarySignalsForIntent`, so the SQL LIMIT never cuts rows that would qualify.
   */
  requiredAnyOf: MatchGateSignal[];
}

export type MatchGateSignal = "cc" | "pc" | "cr" | "pr" | "sp" | "st" | "fd" | "city" | "country";

export const STUDY_OCCUPATION_TYPE_CODES = ["higher_education_non_research", "phd_research", "postdoctoral_research"] as const;

const STUDY_PROGRAM_PATTERNS: Record<StudyProgram, string> = {
  ms: "ms|m\\.s\\.?|masters?|master of|msc|m\\.sc|meng|m\\.eng",
  mba: "mba|pgdm|pgp",
  phd: "phd|ph\\.d\\.?|doctoral|doctorate"
};

/** Wrap an alternation so it only matches whole words (works for terms with punctuation). */
export function wordBoundedPattern(alternation: string): string {
  return `(^|[^[:alnum:]])(${alternation})($|[^[:alnum:]])`;
}

interface CandidateRow {
  id: string;
  full_name: string;
  batch_year: number | null;
  department_code: string | null;
  department_name: string | null;
  headline_role_title: string | null;
  headline_organization_name: string | null;
  residence_city: string | null;
  residence_country: string | null;
  open_to_preferences: unknown;
  completeness_score: number;
  city_match: boolean;
  country_match: boolean;
  keyword_hits: string[] | null;
  [key: string]: unknown;
}

const OCCUPATION_SIGNALS = [
  "cc", // current at company
  "pc", // past at company
  "cr", // current role match
  "pr", // past role match
  "pf", // past from-role match
  "sp", // study program match
  "st", // study type match
  "fd" // founder
] as const;
type OccupationSignalAlias = (typeof OCCUPATION_SIGNALS)[number];

function occupationFromRow(row: CandidateRow, alias: OccupationSignalAlias): OccupationSignal | null {
  const roleTitle = row[`${alias}_role`];
  if (typeof roleTitle !== "string" || roleTitle.trim() === "") return null;
  const org = row[`${alias}_org`];
  return {
    roleTitle,
    organizationName: typeof org === "string" && org.trim() !== "" ? org : null,
    isCurrent: row[`${alias}_current`] === true
  };
}

export class MatchRepo {
  constructor(private readonly db: PoolExecutor) {}

  /**
   * Organization and place names that appear (as substrings) in the question. The parser
   * re-checks word boundaries, so substring over-matching here is harmless.
   */
  async findLexicon(question: string): Promise<MatchLexicon> {
    const lower = question.toLowerCase();
    const [orgs, places] = await Promise.all([
      this.db.query<{ name: string }>(
        `SELECT name FROM (
           SELECT DISTINCT btrim(o.name::text) AS name
           FROM organizations o
           WHERE o.approval_status = 'approved'
             AND char_length(btrim(o.name::text)) >= 2
             AND strpos($1, lower(btrim(o.name::text))) > 0
         ) n
         -- Longest first: short names that sit inside ordinary words must not crowd out the real one.
         ORDER BY char_length(name) DESC, name
         LIMIT 50`,
        [lower]
      ),
      this.db.query<{ city: string; country: string; aliases: string[] | null }>(
        `SELECT cp.city_label AS city,
                cp.country,
                COALESCE(array_agg(pa.alias_normalized) FILTER (WHERE pa.alias_normalized IS NOT NULL), '{}') AS aliases
         FROM canonical_places cp
         LEFT JOIN place_aliases pa ON pa.canonical_place_id = cp.id
         WHERE strpos($1, lower(btrim(cp.city_label))) > 0
            OR EXISTS (
              SELECT 1 FROM place_aliases pa2
              WHERE pa2.canonical_place_id = cp.id
                AND char_length(pa2.alias_normalized) >= 3
                AND strpos($1, pa2.alias_normalized) > 0
            )
         GROUP BY cp.id, cp.city_label, cp.country
         LIMIT 10`,
        [lower]
      )
    ]);
    return {
      organizations: orgs.rows.map((r) => r.name),
      places: places.rows.map(
        (r): MatchLexiconPlace => ({ city: r.city, country: r.country, aliases: (r.aliases ?? []).map((a) => a.toLowerCase()) })
      )
    };
  }

  async findCandidates(input: MatchCandidateQuery): Promise<MatchCandidateSignals[]> {
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const viewerPh = bind(input.viewerPersonId);
    let studyTypesPhCache: string | null = null;
    /** Bound only when used: an unreferenced parameter has no inferable type in Postgres. */
    const studyTypesPh = (): string => (studyTypesPhCache ??= bind([...STUDY_OCCUPATION_TYPE_CODES]));

    const companyCond = input.companyPattern
      ? (() => {
          const ph = bind(wordBoundedPattern(input.companyPattern));
          return `(org.name::text ~* ${ph} OR canon.name::text ~* ${ph})`;
        })()
      : null;
    const roleCond = input.rolePattern ? `o.role_title ~* ${bind(wordBoundedPattern(input.rolePattern))}` : null;
    const fromRoleCond = input.fromRolePattern
      ? `o.role_title ~* ${bind(wordBoundedPattern(input.fromRolePattern))}`
      : null;
    const studyProgramCond =
      input.studyPrograms.length > 0
        ? `(ot.code = ANY(${studyTypesPh()}::text[]) AND o.role_title ~* ${bind(
            wordBoundedPattern(input.studyPrograms.map((p) => STUDY_PROGRAM_PATTERNS[p]).join("|"))
          )})`
        : null;
    const studyTypeCond = input.wantStudy ? `ot.code = ANY(${studyTypesPh()}::text[])` : null;
    const founderCond = input.wantFounder
      ? `(ot.code = 'founded_venture' OR o.role_title ~* '(^|[^[:alnum:]])(co-?founder|founder)($|[^[:alnum:]])')`
      : null;

    const conds: Record<OccupationSignalAlias, string | null> = {
      cc: companyCond ? `o.is_current AND ${companyCond}` : null,
      pc: companyCond ? `NOT o.is_current AND ${companyCond}` : null,
      cr: roleCond ? `o.is_current AND ${roleCond}` : null,
      pr: roleCond ? `NOT o.is_current AND ${roleCond}` : null,
      pf: fromRoleCond ? `NOT o.is_current AND ${fromRoleCond}` : null,
      sp: studyProgramCond,
      st: studyTypeCond,
      fd: founderCond
    };

    const laterals = OCCUPATION_SIGNALS.map((alias) => {
      const cond = conds[alias];
      if (!cond) {
        return `LEFT JOIN LATERAL (SELECT NULL::text AS role_title, NULL::text AS org_name, NULL::boolean AS is_current) ${alias} ON TRUE`;
      }
      return `LEFT JOIN LATERAL (
          SELECT o.role_title, org.name::text AS org_name, o.is_current
          FROM occupations o
          LEFT JOIN organizations org ON org.id = o.organization_id
          LEFT JOIN organizations canon ON canon.id = org.canonical_organization_id
          LEFT JOIN occupation_types ot ON ot.id = o.occupation_type_id
          WHERE o.person_id = p.id AND ${cond}
          ORDER BY o.is_current DESC, o.start_date DESC NULLS LAST, o.created_at DESC
          LIMIT 1
        ) ${alias} ON TRUE`;
    }).join("\n");

    const cityMatchSql =
      input.cityNames.length > 0
        ? (() => {
            const ph = bind(input.cityNames.map((c) => c.toLowerCase()));
            return `(
              lower(btrim(COALESCE(p.residence_city, ''))) = ANY(${ph}::text[])
              OR lower(btrim(COALESCE(cp.city_label, ''))) = ANY(${ph}::text[])
              OR EXISTS (
                SELECT 1 FROM place_aliases pa
                WHERE pa.canonical_place_id = p.residence_canonical_place_id
                  AND pa.alias_normalized = ANY(${ph}::text[])
              )
            )`;
          })()
        : "FALSE";

    const countryMatchSql =
      input.countryNames.length > 0
        ? (() => {
            const ph = bind(input.countryNames.map((c) => c.toLowerCase()));
            return `(
              lower(btrim(COALESCE(p.residence_country, ''))) = ANY(${ph}::text[])
              OR lower(btrim(COALESCE(cp.country, ''))) = ANY(${ph}::text[])
            )`;
          })()
        : "FALSE";

    const keywordSql =
      input.keywords.length > 0
        ? (() => {
            const kwPh = bind(input.keywords.map((k) => k.keyword));
            const patPh = bind(input.keywords.map((k) => wordBoundedPattern(k.pattern)));
            return `ARRAY(
              SELECT u.kw
              FROM unnest(${kwPh}::text[], ${patPh}::text[]) WITH ORDINALITY AS u(kw, pat, ord)
              WHERE hay.text ~* u.pat
              ORDER BY u.ord
            )`;
          })()
        : `ARRAY[]::text[]`;

    // A row is a candidate only if it has one of the category's qualifying signals.
    const gate = input.requiredAnyOf
      .filter((g) => {
        if (g === "city") return input.cityNames.length > 0;
        if (g === "country") return input.countryNames.length > 0;
        return Boolean(conds[g]);
      })
      .map((g) => (g === "city" ? "city_match" : g === "country" ? "country_match" : `${g}_role IS NOT NULL`));
    if (gate.length === 0) return [];

    const roughScore = `(
      (CASE WHEN cc_role IS NOT NULL THEN 50 WHEN pc_role IS NOT NULL THEN 35 ELSE 0 END)
      + (CASE WHEN cr_role IS NOT NULL THEN 30 WHEN pr_role IS NOT NULL THEN 15 ELSE 0 END)
      + (CASE WHEN city_match THEN 40 WHEN country_match THEN 20 ELSE 0 END)
      + (CASE WHEN sp_role IS NOT NULL THEN 35 WHEN st_role IS NOT NULL THEN 20 ELSE 0 END)
      + (CASE WHEN fd_role IS NOT NULL THEN 40 ELSE 0 END)
    )`;

    const limitPh = bind(input.candidateLimit);

    const query = `
      SELECT * FROM (
        SELECT
          p.id,
          p.full_name,
          p.batch_year,
          lower(COALESCE(d.code, p.department_code)) AS department_code,
          COALESCE(d.name, p.department_name) AS department_name,
          head.role_title AS headline_role_title,
          head.org_name AS headline_organization_name,
          p.residence_city,
          p.residence_country,
          p.open_to_preferences,
          (
            CASE WHEN head.role_title IS NOT NULL AND btrim(head.role_title) <> '' THEN 250 ELSE 0 END
            + CASE WHEN head.org_name IS NOT NULL AND btrim(head.org_name) <> '' THEN 150 ELSE 0 END
            + CASE
                WHEN length(btrim(COALESCE(p.bio, ''))) > 80 THEN 200
                WHEN length(btrim(COALESCE(p.bio, ''))) > 0 THEN 100
                ELSE 0
              END
            + CASE WHEN EXISTS (SELECT 1 FROM profile_links pl WHERE pl.person_id = p.id) THEN 50 ELSE 0 END
          )::integer AS completeness_score,
          ${OCCUPATION_SIGNALS.map((a) => `${a}.role_title AS ${a}_role, ${a}.org_name AS ${a}_org, ${a}.is_current AS ${a}_current`).join(",\n          ")},
          ${cityMatchSql} AS city_match,
          ${countryMatchSql} AS country_match,
          ${keywordSql} AS keyword_hits
        FROM people p
        LEFT JOIN departments d ON d.id = p.department_id
        LEFT JOIN canonical_places cp ON cp.id = p.residence_canonical_place_id
        LEFT JOIN LATERAL (
          SELECT o.role_title, org.name::text AS org_name
          FROM occupations o
          LEFT JOIN organizations org ON org.id = o.organization_id
          WHERE o.person_id = p.id
          ORDER BY o.is_current DESC, o.start_date DESC NULLS LAST, o.created_at DESC
          LIMIT 1
        ) head ON TRUE
        LEFT JOIN LATERAL (
          SELECT concat_ws(' ',
            p.bio,
            (SELECT string_agg(concat_ws(' ', o.role_title, o.description, org.name::text), ' ')
             FROM occupations o
             LEFT JOIN organizations org ON org.id = o.organization_id
             WHERE o.person_id = p.id)
          ) AS text
        ) hay ON TRUE
        ${laterals}
        WHERE p.deleted_at IS NULL
          AND p.suspended_at IS NULL
          AND p.full_name IS NOT NULL
          AND p.profile_completed_at IS NOT NULL
          AND ${personIsDiscoverableForViewerSql("p", input.viewerIsDemo)}
          AND p.id <> ${viewerPh}::uuid
      ) c
      WHERE ${gate.join(" OR ")}
      ORDER BY ${roughScore} DESC, c.completeness_score DESC, c.id ASC
      LIMIT ${limitPh}
    `;

    const result = await this.runWithTimeout<CandidateRow>(query, params);
    return result.rows.map((row): MatchCandidateSignals => {
      const pastAtCompany = occupationFromRow(row, "pc");
      const currentAtCompany = occupationFromRow(row, "cc");
      return {
        personId: row.id,
        fullName: row.full_name,
        batchYear: row.batch_year,
        departmentCode: row.department_code,
        departmentName: row.department_name,
        headlineRoleTitle: row.headline_role_title,
        headlineOrganizationName: row.headline_organization_name,
        residenceCity: row.residence_city,
        residenceCountry: row.residence_country,
        currentAtCompany,
        pastAtCompany: currentAtCompany ? null : pastAtCompany,
        currentRoleMatch: occupationFromRow(row, "cr"),
        pastRoleMatch: occupationFromRow(row, "pr"),
        pastFromRoleMatch: occupationFromRow(row, "pf"),
        cityMatch: row.city_match === true,
        countryMatch: row.country_match === true,
        studyProgramMatch: occupationFromRow(row, "sp"),
        studyTypeMatch: occupationFromRow(row, "st"),
        founderMatch: occupationFromRow(row, "fd"),
        keywordHits: row.keyword_hits ?? [],
        openTo: parseOpenToPreferences(row.open_to_preferences)?.selected ?? [],
        completenessScore: row.completeness_score
      };
    });
  }

  /**
   * Query stats: no person id and no question text. Since migration 050 it also keeps what the
   * matcher read (company, role, city, country) so demand can be compared with supply.
   */
  async logQuery(input: {
    category: string | null;
    detectedFields: string[];
    parserSource: "rules" | "llm" | "careers" | "cities";
    resultCount: number;
    hadOverrides: boolean;
    needsDetail: boolean;
    company?: string | null;
    role?: string | null;
    city?: string | null;
    country?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO match_queries (category, detected_fields, parser_source, result_count, had_overrides, needs_detail,
                                  company, role, city, country)
       VALUES ($1, $2::text[], $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.category,
        input.detectedFields,
        input.parserSource,
        input.resultCount,
        input.hadOverrides,
        input.needsDetail,
        input.company ?? null,
        input.role ?? null,
        input.city ?? null,
        input.country ?? null
      ]
    );
  }

  private async runWithTimeout<T extends CandidateRow>(text: string, params: unknown[]): Promise<{ rows: T[] }> {
    const ms = env.DISCOVERY_SEARCH_STATEMENT_TIMEOUT_MS;
    if (ms === 0) return this.db.query<T>(text, params);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout TO ${ms}`);
      const result = await client.query<T>(text, params);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* release resets a broken client */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
