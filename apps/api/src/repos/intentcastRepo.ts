import type { DbExecutor } from "../db/types.js";
import { isExperienceBand, isJobFunction, type ExperienceBand, type JobFunction } from "../lib/jobFunctions.js";
import { personIsDemoSql, personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { DOMAIN_DIRECTORY } from "../lib/domainAllowlist.js";
import {
  audienceLabel,
  audienceParts,
  audienceVisibleSql,
  personMatchesAudienceSql,
  resolvedPlaceSql,
  type AudiencePart,
  type AudienceSnapshot,
  type AuthorAudienceFacts,
  type AudienceUnavailableReason
} from "../lib/postAudience.js";

/** How an author says a resolved request ended (migration 068). */
export const INTENTCAST_RESOLVED_OUTCOMES = ["got_help_here", "sorted_elsewhere", "no_longer_needed"] as const;
export type IntentcastResolvedOutcome = (typeof INTENTCAST_RESOLVED_OUTCOMES)[number];

export type IntentcastStatus = "open" | "closed";
export type IntentcastCategory = "hiring" | "mentorship" | "collaboration" | "guidance";
/** Ask / Offer / Invitation: the author's own statement of what their post is (approved 19:30). */
export type IntentcastKind = "ask" | "offer" | "invitation";

interface IntentcastFeedRow {
  hiring_function?: string | null;
  hiring_role_title?: string | null;
  hiring_experience?: string | null;
  hiring_location?: string | null;
  hiring_company?: string | null;
  hiring_respond_via?: string | null;
  hiring_apply_url?: string | null;
  wall_pinned_at?: Date | null;
  id: string;
  author_person_id: string;
  author_full_name: string;
  author_email_domain: string | null;
  author_department_code: string | null;
  author_department_name: string | null;
  author_batch_year: number | null;
  /** Current occupation (is_current), for bulletin UI tooltips. */
  author_current_role_title: string | null;
  author_current_organization_name: string | null;
  content: string;
  category: IntentcastCategory;
  kind: IntentcastKind | null;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  created_at: Date;
  editable_until: Date;
  author_soft_deleted_at: Date | null;
  author_delete_purge_at: Date | null;
  response_count: number;
  viewer_has_responded: boolean;
  author_is_demo: boolean;
  audience_institution_name: string | null;
  audience_batch_year: number | null;
  audience_department_code: string | null;
  audience_department_name: string | null;
  audience_place_id: string | null;
  audience_place_name: string | null;
}

/** Who can see a post: null = Everyone (migration 067). */
export interface IntentcastAudienceView {
  /** "IIT (BHU) Varanasi · Bengaluru" */
  label: string;
  parts: AudiencePart[];
}

export interface IntentcastFeedView {
  /** Present only for Home Wall feed queries. */
  wallPinnedAt?: Date | null;
  id: string;
  authorPersonId: string;
  authorFullName: string;
  /** Institution display name from the allowed-domain directory, null when the author's domain is unlisted. */
  authorInstitutionName: string | null;
  authorDepartmentCode: string | null;
  authorDepartmentName: string | null;
  authorBatchYear: number | null;
  /** Primary current role title from `occupations`, if any. */
  authorCurrentRoleTitle: string | null;
  /** Organization name for the current occupation, if any. */
  authorCurrentOrganizationName: string | null;
  content: string;
  category: IntentcastCategory;
  /** Null on posts written before the choice existed, and on structured flows that don't ask it. */
  kind: IntentcastKind | null;
  status: IntentcastStatus;
  expiresAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
  createdAt: Date;
  editableUntil: Date;
  authorSoftDeletedAt: Date | null;
  authorDeletePurgeAt: Date | null;
  responseCount: number;
  /** True when the current viewer has already submitted a reply (one reply per post per user). */
  viewerHasResponded: boolean;
  /** Demo/test alumni author — matches `people.is_test_user` or demo institutional email prefixes. */
  authorIsDemo: boolean;
  /** Null = Everyone. Fixed at posting. */
  audience: IntentcastAudienceView | null;
  /** Structured hiring posts only (null on older posts and other categories). */
  hiring: HiringFieldsView | null;
}

export interface IntentcastFeedResult {
  items: IntentcastFeedView[];
  hasMore: boolean;
  nextOffset: number | null;
}

interface IntentcastRow {
  id: string;
  author_person_id: string;
  content: string;
  category: IntentcastCategory;
  kind: IntentcastKind | null;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  closed_by_person_id: string | null;
  created_at: Date;
  editable_until: Date;
  updated_at: Date;
  author_soft_deleted_at: Date | null;
  author_delete_purge_at: Date | null;
  hiring_function?: string | null;
  hiring_role_title?: string | null;
  hiring_experience?: string | null;
  hiring_location?: string | null;
  hiring_company?: string | null;
  hiring_respond_via?: string | null;
  hiring_apply_url?: string | null;
}

/** A hiring post's answers (no heading: the card header is built from these). */
export interface HiringFieldsView {
  jobFunction: JobFunction;
  roleTitle: string | null;
  experience: ExperienceBand;
  location: string | null;
  company: string | null;
  respondVia: "reachout" | "link";
  applyUrl: string | null;
}

export type HiringFieldsInput = HiringFieldsView;

function mapHiring(row: Pick<IntentcastRow, "hiring_function" | "hiring_role_title" | "hiring_experience" | "hiring_location" | "hiring_company" | "hiring_respond_via" | "hiring_apply_url">): HiringFieldsView | null {
  if (!isJobFunction(row.hiring_function) || !isExperienceBand(row.hiring_experience)) return null;
  return {
    jobFunction: row.hiring_function,
    roleTitle: row.hiring_role_title ?? null,
    experience: row.hiring_experience,
    location: row.hiring_location ?? null,
    company: row.hiring_company ?? null,
    respondVia: row.hiring_respond_via === "link" ? "link" : "reachout",
    applyUrl: row.hiring_apply_url ?? null
  };
}

interface IntentcastResponseRow {
  id: string;
  intentcast_id: string;
  responder_person_id: string;
  message: string;
  created_at: Date;
  updated_at: Date;
}

interface IntentcastResponseViewRow extends IntentcastResponseRow {
  responder_full_name: string;
  responder_department_code: string | null;
  responder_department_name: string | null;
  responder_is_demo: boolean;
}

export interface IntentcastResponseView {
  id: string;
  intentcastId: string;
  responderPersonId: string;
  responderFullName: string;
  responderDepartmentCode: string | null;
  responderDepartmentName: string | null;
  message: string;
  createdAt: Date;
  responderIsDemo: boolean;
}

export interface CreateIntentcastInput {
  authorPersonId: string;
  content: string;
  category: IntentcastCategory;
  kind?: IntentcastKind | null;
  expiresAt: Date;
  /** Cities v1: a post made from a city page carries that city. */
  placeId?: string | null;
  /** Who can see it (copied from the author at posting). Missing = Everyone. */
  audience?: AudienceSnapshot | null;
  /** Structured hiring post answers. */
  hiring?: HiringFieldsInput | null;
}

export interface FeedInput {
  homeWall?: boolean;
  viewerPersonId: string;
  limit: number;
  offset: number;
  category?: IntentcastCategory;
  status?: IntentcastStatus;
  mine?: boolean;
  /**
   * With `mine`, list the viewer’s posts regardless of `expires_at`, and include both open and closed rows
   * (e.g. Career “Post a role” dashboard).
   */
  authorHistory?: boolean;
  /**
   * When true, omit author–soft-deleted rows for every viewer (including the author).
   * Use for public “Opportunities” style feeds where removed posts must not appear at all.
   */
  excludeAuthorSoftDeleted?: boolean;
  /** Omit rows in any of these categories (e.g. `guidance` for Careers activity — “Can help” hub). */
  excludeCategories?: IntentcastCategory[];
  /** From the actor's role: admins see posts outside their audience. */
  viewerIsAdmin?: boolean;
}

export interface CreateIntentcastResponseInput {
  intentcastId: string;
  responderPersonId: string;
  message: string;
}

/** Rows for in-app notifications: replies to posts authored by `authorPersonId`. */
export interface BulletinResponseNotificationRow {
  responseId: string;
  responseCreatedAt: Date;
  responseMessage: string;
  intentcastId: string;
  intentcastContent: string;
  responderPersonId: string;
  responderFullName: string | null;
}

/** Home “Replies” tab — responses on the viewer’s non-deleted bulletin posts. */
export interface ReceivedResponseFeedRow {
  responseId: string;
  responseCreatedAt: Date;
  responseMessage: string;
  intentcastId: string;
  intentcastContent: string;
  responderPersonId: string;
  responderFullName: string | null;
  responderDepartmentCode: string | null;
  responderBatchYear: number | null;
  responderIsDemo: boolean;
}

interface ReceivedResponseFeedSqlRow {
  total_count: string;
  response_id: string;
  response_created_at: Date;
  response_message: string;
  intentcast_id: string;
  intentcast_content: string;
  responder_person_id: string;
  responder_full_name: string | null;
  responder_department_code: string | null;
  responder_batch_year: number | null;
  responder_is_demo: boolean;
}

interface BulletinResponseNotificationSqlRow {
  response_id: string;
  response_created_at: Date;
  response_message: string;
  intentcast_id: string;
  intentcast_content: string;
  responder_person_id: string;
  responder_full_name: string | null;
}

export interface UpdateIntentcastInput {
  intentcastId: string;
  authorPersonId: string;
  content?: string;
  category?: IntentcastCategory;
}

function mapFeedRow(row: IntentcastFeedRow): IntentcastFeedView {
  return {
    id: row.id,
    wallPinnedAt: row.wall_pinned_at ?? null,
    authorPersonId: row.author_person_id,
    authorFullName: row.author_full_name,
    authorInstitutionName: row.author_email_domain ? (DOMAIN_DIRECTORY[row.author_email_domain]?.institution ?? null) : null,
    authorDepartmentCode: row.author_department_code,
    authorDepartmentName: row.author_department_name,
    authorBatchYear: row.author_batch_year != null ? Number(row.author_batch_year) : null,
    authorCurrentRoleTitle: row.author_current_role_title,
    authorCurrentOrganizationName: row.author_current_organization_name,
    content: row.content,
    category: row.category,
    kind: row.kind ?? null,
    status: row.status,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    closedReason: row.closed_reason,
    createdAt: row.created_at,
    editableUntil: row.editable_until,
    authorSoftDeletedAt: row.author_soft_deleted_at,
    authorDeletePurgeAt: row.author_delete_purge_at,
    responseCount: Number(row.response_count),
    viewerHasResponded: Boolean(row.viewer_has_responded),
    authorIsDemo: Boolean(row.author_is_demo),
    audience: mapAudience(row),
    hiring: mapHiring(row)
  };
}

function mapAudience(row: Pick<
  IntentcastFeedRow,
  | "audience_institution_name"
  | "audience_batch_year"
  | "audience_department_code"
  | "audience_department_name"
  | "audience_place_id"
  | "audience_place_name"
>): IntentcastAudienceView | null {
  const batchYear = row.audience_batch_year != null ? Number(row.audience_batch_year) : null;
  const parts = audienceParts({
    emailDomains: row.audience_institution_name ? [row.audience_institution_name] : null,
    batchYear,
    departmentCode: row.audience_department_code,
    placeId: row.audience_place_id
  });
  if (parts.length === 0) return null;
  const label =
    audienceLabel({
      institutionName: row.audience_institution_name,
      batchYear,
      departmentName: row.audience_department_name,
      placeName: row.audience_place_name
    }) ?? "A smaller group";
  return { label, parts };
}

/** Audience columns for a feed row; needs the AUDIENCE_PLACE_JOIN join. */
const AUDIENCE_SELECT = `
        i.audience_institution_name,
        i.audience_batch_year,
        i.audience_department_code,
        i.audience_department_name,
        i.audience_place_id,
        aud_place.city_label AS audience_place_name,
        i.hiring_function,
        i.hiring_role_title,
        i.hiring_experience,
        i.hiring_location,
        i.hiring_company,
        i.hiring_respond_via,
        i.hiring_apply_url`;
const AUDIENCE_PLACE_JOIN = `LEFT JOIN canonical_places aud_place ON aud_place.id = i.audience_place_id`;

function mapResponseRow(row: IntentcastResponseViewRow): IntentcastResponseView {
  return {
    id: row.id,
    intentcastId: row.intentcast_id,
    responderPersonId: row.responder_person_id,
    responderFullName: row.responder_full_name,
    responderDepartmentCode: row.responder_department_code,
    responderDepartmentName: row.responder_department_name,
    message: row.message,
    createdAt: row.created_at,
    responderIsDemo: Boolean(row.responder_is_demo)
  };
}

export class IntentcastRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(input: CreateIntentcastInput): Promise<IntentcastRow> {
    const result = await this.db.query<IntentcastRow>(
      `
      INSERT INTO intentcasts (
        author_person_id, content, category, kind, expires_at, editable_until, place_id,
        audience_email_domains, audience_institution_name, audience_batch_year,
        audience_department_code, audience_department_name, audience_place_id,
        hiring_function, hiring_role_title, hiring_experience, hiring_location, hiring_company,
        hiring_respond_via, hiring_apply_url
      )
      VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes', $6::uuid, $7::text[], $8, $9, $10, $11, $12::uuid,
        $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
      `,
      [
        input.authorPersonId,
        input.content,
        input.category,
        input.kind ?? null,
        input.expiresAt,
        input.placeId ?? null,
        input.audience?.emailDomains ?? null,
        input.audience?.institutionName ?? null,
        input.audience?.batchYear ?? null,
        input.audience?.departmentCode ?? null,
        input.audience?.departmentName ?? null,
        input.audience?.placeId ?? null,
        input.hiring?.jobFunction ?? null,
        input.hiring?.roleTitle ?? null,
        input.hiring?.experience ?? null,
        input.hiring?.location ?? null,
        input.hiring?.company ?? null,
        input.hiring?.respondVia ?? null,
        input.hiring?.applyUrl ?? null
      ]
    );
    return result.rows[0]!;
  }

  async findById(intentcastId: string): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      SELECT *
      FROM intentcasts
      WHERE id = $1
      LIMIT 1
      `,
      [intentcastId]
    );
    return result.rows[0] ?? null;
  }

  async expireOpenIntentcasts(limit = 2000): Promise<number> {
    // Post expiry disabled (user request, 2026-11-21): automatic closing is commented out, not
    // deleted. New and currently open posts stay open; posts already closed stay closed.
    // expires_at is still recorded on new posts but no longer closes anything.
    // Restore the UPDATE below to re-enable.
    void limit;
    return 0;
    /*
    const result = await this.db.query(
      `
      WITH target AS (
        SELECT id
        FROM intentcasts
        WHERE status = 'open'
          AND expires_at <= now()
        ORDER BY expires_at ASC
        LIMIT $1
      )
      UPDATE intentcasts i
      SET
        status = 'closed',
        closed_reason = 'expired',
        closed_at = now(),
        closed_by_person_id = NULL
      FROM target t
      WHERE i.id = t.id
      `,
      [limit]
    );
    return result.rowCount ?? 0;
    */
  }

  async listFeed(input: FeedInput): Promise<IntentcastFeedResult> {
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [
      "p.deleted_at IS NULL",
      "p.suspended_at IS NULL",
      "p.full_name IS NOT NULL"
    ];

    const authorDashboard = Boolean(input.mine && input.authorHistory);
    // Post expiry disabled (user request, 2026-11-21): open posts no longer drop out of the feed
    // when expires_at passes. Commented out, not deleted; restore with expireOpenIntentcasts.
    // if (!authorDashboard) {
    //   where.push("i.expires_at > now()");
    // }

    if (authorDashboard) {
      where.push(`(i.status = 'open' OR i.status = 'closed')`);
    } else {
      const statusPh = bind(input.status ?? "open");
      where.push(`i.status = ${statusPh}`);
    }

    if (input.category) {
      const categoryPh = bind(input.category);
      where.push(`i.category = ${categoryPh}`);
    }

    if (input.mine) {
      const minePh = bind(input.viewerPersonId);
      where.push(`i.author_person_id = ${minePh}`);
    }

    const viewerPh = bind(input.viewerPersonId);
    if (input.excludeAuthorSoftDeleted) {
      where.push("i.author_soft_deleted_at IS NULL");
    } else {
      where.push(
        `(i.author_soft_deleted_at IS NULL OR i.author_person_id = ${viewerPh})`
      );
    }

    // Who can see each post (migration 067). `vp` is the viewer, joined below.
    where.push(audienceVisibleSql("i", "vp", { viewerIsAdmin: input.viewerIsAdmin }));

    if (input.excludeCategories && input.excludeCategories.length > 0) {
      const placeholders = input.excludeCategories.map((cat) => {
        const ph = bind(cat);
        return ph;
      });
      where.push(`i.category NOT IN (${placeholders.join(", ")})`);
    }

    const limitPh = bind(input.limit + 1);
    const offsetPh = bind(input.offset);

    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        ${input.homeWall && !input.mine && !input.authorHistory ? '(SELECT wp.pinned_at FROM wall_post_pins wp WHERE wp.intentcast_id = i.id)' : 'NULL::timestamptz'} AS wall_pinned_at,
        i.author_person_id,
        p.full_name AS author_full_name,
        lower(split_part(p.institutional_email, '@', 2)) AS author_email_domain,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.code, p.department_code) END AS author_department_code,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.name, p.department_name) END AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.kind,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        EXISTS (
          SELECT 1
          FROM intentcast_responses r_v
          WHERE r_v.intentcast_id = i.id
            AND r_v.responder_person_id = ${viewerPh}
        ) AS viewer_has_responded,
        ${personIsDemoSql("p")} AS author_is_demo,${AUDIENCE_SELECT}
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      ${AUDIENCE_PLACE_JOIN}
      LEFT JOIN people vp ON vp.id = ${viewerPh}::uuid
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      WHERE ${where.join("\n  AND ")}
      /* Bulletin feed ordering — document in docs/bulletin-feed-ranking.md; update when this changes. */
      ORDER BY
        ${input.homeWall && !input.mine && !input.authorHistory ? 'wall_pinned_at DESC NULLS LAST,' : ''}
        CASE
          WHEN (${personIsDemoSql("vp")}) AND (${personIsDemoSql("p")}) THEN 0
          WHEN (
            (SELECT COUNT(*)::int FROM intentcast_responses r WHERE r.intentcast_id = i.id) = 0
            AND i.created_at >= (now() - interval '48 hours')
          ) THEN 1
          ELSE 2
        END ASC,
        i.created_at DESC,
        i.id DESC
      LIMIT ${limitPh}
      OFFSET ${offsetPh}
      `,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > input.limit;
    const trimmed = hasMore ? rows.slice(0, input.limit) : rows;
    const mapped = trimmed.map(mapFeedRow);

    return {
      items: mapped,
      hasMore,
      nextOffset: hasMore ? input.offset + input.limit : null
    };
  }

  async findFeedItemById(
    intentcastId: string,
    viewerPersonId?: string | null
  ): Promise<IntentcastFeedView | null> {
    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        lower(split_part(p.institutional_email, '@', 2)) AS author_email_domain,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.code, p.department_code) END AS author_department_code,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.name, p.department_name) END AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.kind,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        (
          $2::uuid IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM intentcast_responses r_v
            WHERE r_v.intentcast_id = i.id
              AND r_v.responder_person_id = $2::uuid
          )
        ) AS viewer_has_responded,
        ${personIsDemoSql("p")} AS author_is_demo,${AUDIENCE_SELECT}
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      ${AUDIENCE_PLACE_JOIN}
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      WHERE i.id = $1
      LIMIT 1
      `,
      [intentcastId, viewerPersonId ?? null]
    );
    const row = result.rows[0];
    return row ? mapFeedRow(row) : null;
  }

  /**
   * Single bulletin card for deep links / notifications.
   * Author always sees their own row (incl. closed, expired, soft-deleted).
   * Others: same rules as public feed (open, not expired, author has not removed from bulletin).
   */
  async findFeedItemVisibleToViewer(
    intentcastId: string,
    viewerPersonId: string,
    viewerIsAdmin = false
  ): Promise<IntentcastFeedView | null> {
    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        lower(split_part(p.institutional_email, '@', 2)) AS author_email_domain,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.code, p.department_code) END AS author_department_code,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.name, p.department_name) END AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.kind,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        EXISTS (
          SELECT 1
          FROM intentcast_responses r_v
          WHERE r_v.intentcast_id = i.id
            AND r_v.responder_person_id = $2::uuid
        ) AS viewer_has_responded,
        ${personIsDemoSql("p")} AS author_is_demo,${AUDIENCE_SELECT}
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      ${AUDIENCE_PLACE_JOIN}
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      LEFT JOIN people vp ON vp.id = $2::uuid
      WHERE i.id = $1
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND (
          i.author_person_id = $2::uuid
          OR (
            -- Post expiry disabled (user request, 2026-11-21): expires_at no longer hides open
            -- posts. Commented out, not deleted:
            -- i.expires_at > now() AND
            i.status = 'open'
            AND i.author_soft_deleted_at IS NULL
            -- Outside the audience looks exactly like closed or removed (migration 067).
            AND ${audienceVisibleSql("i", "vp", { viewerIsAdmin })}
          )
        )
      LIMIT 1
      `,
      [intentcastId, viewerPersonId]
    );
    const row = result.rows[0];
    return row ? mapFeedRow(row) : null;
  }

  /**
   * Hides the post from non-authors until purge. Extends `expires_at` so TTL close does not run before purge.
   */
  async softDeleteByAuthor(
    intentcastId: string,
    authorPersonId: string,
    purgeAt: Date
  ): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        author_soft_deleted_at = now(),
        author_delete_purge_at = $3,
        expires_at = GREATEST(expires_at, $3),
        updated_at = now()
      WHERE id = $1
        AND author_person_id = $2
        AND author_soft_deleted_at IS NULL
      RETURNING *
      `,
      [intentcastId, authorPersonId, purgeAt]
    );
    return result.rows[0] ?? null;
  }

  /** Permanently remove soft-deleted rows whose retention window has ended (cascades responses). */
  async purgeAuthorSoftDeletedIntentcasts(limit = 500): Promise<number> {
    const result = await this.db.query(
      `
      WITH doomed AS (
        SELECT id
        FROM intentcasts
        WHERE author_delete_purge_at IS NOT NULL
          AND author_delete_purge_at <= now()
        ORDER BY author_delete_purge_at ASC
        LIMIT $1
      )
      DELETE FROM intentcasts i
      USING doomed d
      WHERE i.id = d.id
      `,
      [limit]
    );
    return result.rowCount ?? 0;
  }

  async closeManually(intentcastId: string, actorPersonId: string): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        status = 'closed',
        closed_reason = 'manual',
        closed_at = now(),
        closed_by_person_id = $2
      WHERE id = $1
        AND author_person_id = $2
        AND status = 'open'
        AND author_soft_deleted_at IS NULL
      RETURNING *
      `,
      [intentcastId, actorPersonId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Author closes their own open post as RESOLVED with an outcome (Business progress steps, migration 068).
   * Same guards as closeManually; a resolved post is closed, so it leaves the feed like any other.
   */
  async closeResolved(
    intentcastId: string,
    actorPersonId: string,
    outcome: IntentcastResolvedOutcome
  ): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        status = 'closed',
        closed_reason = 'resolved',
        resolved_outcome = $3,
        closed_at = now(),
        closed_by_person_id = $2
      WHERE id = $1
        AND author_person_id = $2
        AND status = 'open'
        AND author_soft_deleted_at IS NULL
      RETURNING *
      `,
      [intentcastId, actorPersonId, outcome]
    );
    return result.rows[0] ?? null;
  }

  async updateWithinEditWindow(input: UpdateIntentcastInput): Promise<IntentcastRow | null> {
    const setParts: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.content !== undefined) {
      const ph = bind(input.content);
      setParts.push(`content = ${ph}`);
    }
    if (input.category !== undefined) {
      const ph = bind(input.category);
      setParts.push(`category = ${ph}`);
    }
    if (setParts.length === 0) {
      return this.findById(input.intentcastId);
    }

    const idPh = bind(input.intentcastId);
    const authorPh = bind(input.authorPersonId);
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        ${setParts.join(",\n        ")},
        updated_at = now()
      WHERE id = ${idPh}
        AND author_person_id = ${authorPh}
        AND status = 'open'
        AND author_soft_deleted_at IS NULL
        AND editable_until >= now()
      RETURNING *
      `,
      params
    );
    return result.rows[0] ?? null;
  }

  /**
   * Whether `viewerPersonId` is in the post's audience (or is its author). Says nothing about open/closed.
   * No admin bypass: replying stays audience-bound even for admins.
   */
  async isInAudience(intentcastId: string, viewerPersonId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      SELECT 1
      FROM intentcasts i
      LEFT JOIN people vp ON vp.id = $2::uuid
      WHERE i.id = $1::uuid AND ${audienceVisibleSql("i", "vp")}
      `,
      [intentcastId, viewerPersonId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * How many OTHER members an audience reaches right now: active accounts the author's feed rules would
   * show the post to (demo authors count demo members, real authors real ones). For the size preview
   * and the "no one matches" check only; never returned unrounded.
   */
  async countAudience(authorPersonId: string, authorIsDemo: boolean, a: AudienceSnapshot): Promise<number> {
    const result = await this.db.query<{ n: string }>(
      `
      SELECT COUNT(*)::text AS n
      FROM people v
      WHERE v.id <> $1::uuid
        AND v.deleted_at IS NULL
        AND v.suspended_at IS NULL
        AND ${personIsDiscoverableForViewerSql("v", authorIsDemo)}
        AND ${personMatchesAudienceSql("v", {
          emailDomains: "$2::text[]",
          batchYear: "$3::int",
          departmentCode: "$4::text",
          placeId: "$5::uuid"
        })}
      `,
      [authorPersonId, a.emailDomains, a.batchYear, a.departmentCode, a.placeId]
    );
    return Number(result.rows[0]?.n ?? "0");
  }

  /** The author's own details an audience can use, and why any of them can't be used. */
  async loadAuthorAudienceFacts(
    personId: string
  ): Promise<(AuthorAudienceFacts & { institutionalEmail: string; isDemo: boolean }) | null> {
    const result = await this.db.query<{
      institutional_email: string;
      is_demo: boolean;
      batch_year: number | null;
      department_code: string | null;
      department_name: string | null;
      department_other_text: string | null;
      department_other_status: string | null;
      raw_place_id: string | null;
      place_id: string | null;
      place_name: string | null;
      place_status: string | null;
      residence_city: string | null;
    }>(
      `
      SELECT
        p.institutional_email::text AS institutional_email,
        ${personIsDemoSql("p")} AS is_demo,
        COALESCE(p.batch_year, p.joining_year)::int AS batch_year,
        NULLIF(lower(COALESCE(d.code, p.department_code)), 'other') AS department_code,
        COALESCE(d.name, p.department_name) AS department_name,
        p.department_other_text,
        p.department_other_status,
        p.residence_canonical_place_id AS raw_place_id,
        rp.id AS place_id,
        rp.city_label AS place_name,
        rp.status AS place_status,
        p.residence_city
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN canonical_places rp ON rp.id = ${resolvedPlaceSql("p.residence_canonical_place_id")}
      WHERE p.id = $1::uuid
      `,
      [personId]
    );
    const r = result.rows[0];
    if (!r) return null;

    let departmentUnavailable: AudienceUnavailableReason | null = null;
    if (!r.department_code) {
      if (r.department_other_text && r.department_other_status === "pending") departmentUnavailable = "pending_review";
      else if (r.department_other_text && r.department_other_status === "approved") departmentUnavailable = "other_department";
      else departmentUnavailable = "missing";
    }
    let placeUnavailable: AudienceUnavailableReason | null = null;
    if (!r.place_id) placeUnavailable = r.residence_city && r.residence_city.trim() ? "city_not_linked" : "missing";
    else if (r.place_status && r.place_status !== "approved") placeUnavailable = "city_pending";

    return {
      institutionalEmail: r.institutional_email,
      isDemo: Boolean(r.is_demo),
      batchYear: r.batch_year != null ? Number(r.batch_year) : null,
      departmentCode: departmentUnavailable ? null : r.department_code,
      departmentName: departmentUnavailable ? null : r.department_name ?? r.department_code,
      departmentUnavailable,
      placeId: placeUnavailable ? null : r.place_id,
      placeName: placeUnavailable ? null : r.place_name,
      placeUnavailable
    };
  }

  async createResponse(input: CreateIntentcastResponseInput): Promise<IntentcastResponseRow> {
    const result = await this.db.query<IntentcastResponseRow>(
      `
      INSERT INTO intentcast_responses (intentcast_id, responder_person_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [input.intentcastId, input.responderPersonId, input.message]
    );
    return result.rows[0]!;
  }

  async listResponsesForIntentcast(intentcastId: string): Promise<IntentcastResponseView[]> {
    const result = await this.db.query<IntentcastResponseViewRow>(
      `
      SELECT
        r.id,
        r.intentcast_id,
        r.responder_person_id,
        r.message,
        r.created_at,
        r.updated_at,
        p.full_name AS responder_full_name,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.code, p.department_code) END AS responder_department_code,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.name, p.department_name) END AS responder_department_name,
        ${personIsDemoSql("p")} AS responder_is_demo
      FROM intentcast_responses r
      JOIN people p ON p.id = r.responder_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE r.intentcast_id = $1
      ORDER BY r.created_at DESC, r.id DESC
      `,
      [intentcastId]
    );
    return result.rows.map(mapResponseRow);
  }

  async listReceivedResponsesFeedForAuthor(
    authorPersonId: string,
    limit: number,
    offset: number
  ): Promise<{ rows: ReceivedResponseFeedRow[]; totalCount: number }> {
    const result = await this.db.query<ReceivedResponseFeedSqlRow>(
      `
      SELECT
        (COUNT(*) OVER ())::text AS total_count,
        r.id AS response_id,
        r.created_at AS response_created_at,
        r.message AS response_message,
        i.id AS intentcast_id,
        i.content AS intentcast_content,
        p.id AS responder_person_id,
        p.full_name AS responder_full_name,
        CASE WHEN d.code = 'other' THEN NULL ELSE COALESCE(d.code, p.department_code) END AS responder_department_code,
        COALESCE(p.batch_year, p.joining_year)::int AS responder_batch_year,
        ${personIsDemoSql("p")} AS responder_is_demo
      FROM intentcast_responses r
      JOIN intentcasts i ON i.id = r.intentcast_id
      JOIN people p ON p.id = r.responder_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE i.author_person_id = $1
        AND i.author_soft_deleted_at IS NULL
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $2 OFFSET $3
      `,
      [authorPersonId, limit, offset]
    );
    const rawRows = result.rows;
    const totalCount =
      rawRows.length > 0 ? Number.parseInt(String(rawRows[0]?.total_count ?? "0"), 10) : 0;
    const rows: ReceivedResponseFeedRow[] = rawRows.map((row) => ({
      responseId: row.response_id,
      responseCreatedAt: row.response_created_at,
      responseMessage: row.response_message,
      intentcastId: row.intentcast_id,
      intentcastContent: row.intentcast_content,
      responderPersonId: row.responder_person_id,
      responderFullName: row.responder_full_name,
      responderDepartmentCode: row.responder_department_code,
      responderBatchYear: row.responder_batch_year,
      responderIsDemo: Boolean(row.responder_is_demo)
    }));
    return { rows, totalCount };
  }

  async listBulletinResponseNotificationsForAuthor(
    authorPersonId: string,
    limit: number
  ): Promise<BulletinResponseNotificationRow[]> {
    const result = await this.db.query<BulletinResponseNotificationSqlRow>(
      `
      SELECT
        r.id AS response_id,
        r.created_at AS response_created_at,
        r.message AS response_message,
        i.id AS intentcast_id,
        i.content AS intentcast_content,
        p.id AS responder_person_id,
        p.full_name AS responder_full_name
      FROM intentcast_responses r
      JOIN intentcasts i ON i.id = r.intentcast_id
      JOIN people p ON p.id = r.responder_person_id
      WHERE i.author_person_id = $1
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $2
      `,
      [authorPersonId, limit]
    );
    return result.rows.map((row) => ({
      responseId: row.response_id,
      responseCreatedAt: row.response_created_at,
      responseMessage: row.response_message,
      intentcastId: row.intentcast_id,
      intentcastContent: row.intentcast_content,
      responderPersonId: row.responder_person_id,
      responderFullName: row.responder_full_name
    }));
  }

  async countBulletinResponseNotificationsForAuthor(authorPersonId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM intentcast_responses r
      JOIN intentcasts i ON i.id = r.intentcast_id
      WHERE i.author_person_id = $1
      `,
      [authorPersonId]
    );
    return Number.parseInt(result.rows[0]?.c ?? "0", 10);
  }
}
