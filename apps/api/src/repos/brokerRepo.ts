import type { Pool, PoolClient } from "pg";
import { personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { experienceBandSql, isExperienceBand, isJobFunction, type ExperienceBand, type JobFunction } from "../lib/jobFunctions.js";
import { DOMAIN_DIRECTORY } from "../lib/domainAllowlist.js";
import type { NoteDetails } from "../lib/noteDetails.js";

type Db = Pool | PoolClient;

export type BrokerKind = "referral" | "hiring";
export type BrokerRequestStatus = "open" | "connected" | "expired";
export type BrokerAskStatus = "asked" | "accepted" | "declined" | "withdrawn";

/** Members who can be asked: active, finished profile, visible to the asker (demo sees demo only). */
function helperBaseSql(alias: string, askerIsDemo: boolean): string {
  return `${alias}.deleted_at IS NULL
        AND ${alias}.suspended_at IS NULL
        AND ${alias}.full_name IS NOT NULL
        AND ${alias}.profile_completed_at IS NOT NULL
        AND ${personIsDiscoverableForViewerSql(alias, askerIsDemo)}`;
}

/** A company's display name: the main company when it was merged into one. */
const COMPANY_NAME_SQL = `COALESCE(canon.name, org.name)::text`;

export interface BrokerRequestRow {
  id: string;
  kind: BrokerKind;
  asker_person_id: string;
  intentcast_id: string | null;
  company: string;
  job_function: string;
  experience_band: string | null;
  role_title: string | null;
  job_url: string | null;
  message: string;
  details: NoteDetails | null;
  status: BrokerRequestStatus;
  asked_count: number;
  expires_at: Date;
  contact_request_id: string | null;
  first_seen_at: Date | null;
  connected_at: Date | null;
  expired_at: Date | null;
  created_at: Date;
}

export interface AskerRequestView {
  id: string;
  kind: BrokerKind;
  company: string;
  jobFunction: JobFunction;
  experienceBand: ExperienceBand | null;
  roleTitle: string | null;
  jobUrl: string | null;
  status: BrokerRequestStatus;
  askedCount: number;
  seenCount: number;
  createdAt: Date;
  expiresAt: Date;
  firstSeenAt: Date | null;
  connectedAt: Date | null;
  expiredAt: Date | null;
  intentcastId: string | null;
  connection: { personId: string; fullName: string | null; contactShared: string | null } | null;
}

export interface HelperAskView {
  askId: string;
  requestId: string;
  kind: BrokerKind;
  status: BrokerAskStatus;
  requestStatus: BrokerRequestStatus;
  askedAt: Date;
  expiresAt: Date;
  seenAt: Date | null;
  company: string;
  jobFunction: JobFunction;
  experienceBand: ExperienceBand | null;
  roleTitle: string | null;
  jobUrl: string | null;
  message: string;
  details: NoteDetails | null;
  asker: {
    personId: string;
    fullName: string | null;
    institutionName: string | null;
    batchYear: number | null;
    departmentCode: string | null;
  };
  /** Only once this helper said yes: how to reach the asker. */
  askerContact: string | null;
}

export interface AskForResponseRow {
  ask_id: string;
  ask_status: BrokerAskStatus;
  helper_person_id: string;
  request_id: string;
  request_status: BrokerRequestStatus;
  expires_at: Date;
}

export interface PersonContactRow {
  id: string;
  full_name: string | null;
  institutional_email: string;
  personal_email: string | null;
  batch_year: number | null;
}

function mapRequestView(r: BrokerRequestRow & {
  seen_count: string | number;
  connection_person_id: string | null;
  connection_full_name: string | null;
  connection_contact: string | null;
}): AskerRequestView {
  return {
    id: r.id,
    kind: r.kind,
    company: r.company,
    jobFunction: isJobFunction(r.job_function) ? r.job_function : "other",
    experienceBand: isExperienceBand(r.experience_band) ? r.experience_band : null,
    roleTitle: r.role_title,
    jobUrl: r.job_url,
    status: r.status,
    askedCount: Number(r.asked_count),
    seenCount: Number(r.seen_count),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    firstSeenAt: r.first_seen_at,
    connectedAt: r.connected_at,
    expiredAt: r.expired_at,
    intentcastId: r.intentcast_id,
    connection: r.connection_person_id
      ? { personId: r.connection_person_id, fullName: r.connection_full_name, contactShared: r.connection_contact }
      : null
  };
}

export class BrokerRepo {
  constructor(private readonly db: Db) {}

  /**
   * Companies where alumni work now, with how many could be asked for a referral. Unlike the
   * "Open to referrals" list, everyone currently at the company counts (approved for now).
   */
  async referralCompanies(askerPersonId: string, askerIsDemo: boolean, limit: number): Promise<Array<{ company: string; alumni: number }>> {
    const r = await this.db.query<{ company: string; alumni: string }>(
      `
      SELECT ${COMPANY_NAME_SQL} AS company, COUNT(DISTINCT p.id)::text AS alumni
      FROM occupations occ
      JOIN organizations org ON org.id = occ.organization_id
      LEFT JOIN organizations canon ON canon.id = org.canonical_organization_id
      JOIN people p ON p.id = occ.person_id
      WHERE occ.is_current
        AND org.approval_status <> 'rejected'
        AND ${helperBaseSql("p", askerIsDemo)}
        AND p.id <> $1::uuid
      GROUP BY 1
      ORDER BY COUNT(DISTINCT p.id) DESC, lower(${COMPANY_NAME_SQL})
      LIMIT $2
      `,
      [askerPersonId, limit]
    );
    return r.rows.map((row) => ({ company: row.company, alumni: Number(row.alumni) }));
  }

  /**
   * Everyone currently at the company (by its main company's name, case-insensitive), except the
   * asker. Returns the company's display name as members see it, or null when nobody is there.
   */
  async referralHelpers(company: string, askerPersonId: string, askerIsDemo: boolean): Promise<{ company: string | null; helperIds: string[] }> {
    const r = await this.db.query<{ person_id: string; company: string }>(
      `
      SELECT DISTINCT p.id AS person_id, ${COMPANY_NAME_SQL} AS company
      FROM occupations occ
      JOIN organizations org ON org.id = occ.organization_id
      LEFT JOIN organizations canon ON canon.id = org.canonical_organization_id
      JOIN people p ON p.id = occ.person_id
      WHERE occ.is_current
        AND org.approval_status <> 'rejected'
        AND lower(${COMPANY_NAME_SQL}) = lower($1)
        AND ${helperBaseSql("p", askerIsDemo)}
        AND p.id <> $2::uuid
      `,
      [company.trim(), askerPersonId]
    );
    return { company: r.rows[0]?.company ?? null, helperIds: r.rows.map((row) => row.person_id) };
  }

  /** Everyone whose function and experience (from graduation year) match the hiring post, except the poster. */
  async hiringHelpers(jobFunction: JobFunction, band: ExperienceBand, askerPersonId: string, askerIsDemo: boolean): Promise<string[]> {
    const r = await this.db.query<{ id: string }>(
      `
      SELECT p.id
      FROM people p
      WHERE p.job_function = $1
        AND ${experienceBandSql("p.batch_year")} = $2
        AND ${helperBaseSql("p", askerIsDemo)}
        AND p.id <> $3::uuid
      `,
      [jobFunction, band, askerPersonId]
    );
    return r.rows.map((row) => row.id);
  }

  async openReferralRequests(askerPersonId: string): Promise<Array<{ id: string; company: string }>> {
    const r = await this.db.query<{ id: string; company: string }>(
      `SELECT id, company FROM broker_requests WHERE asker_person_id = $1 AND kind = 'referral' AND status = 'open' AND expires_at > now()`,
      [askerPersonId]
    );
    return r.rows;
  }

  /** Private hiring asks (no Wall post) still open, for the one-per-function-and-level rule. */
  async openPrivateHiringRequests(askerPersonId: string): Promise<Array<{ id: string; job_function: string; experience_band: string | null }>> {
    const r = await this.db.query<{ id: string; job_function: string; experience_band: string | null }>(
      `SELECT id, job_function, experience_band FROM broker_requests
       WHERE asker_person_id = $1 AND kind = 'hiring' AND intentcast_id IS NULL AND status = 'open' AND expires_at > now()`,
      [askerPersonId]
    );
    return r.rows;
  }

  async requestForIntentcast(intentcastId: string): Promise<BrokerRequestRow | null> {
    const r = await this.db.query<BrokerRequestRow>(`SELECT * FROM broker_requests WHERE intentcast_id = $1`, [intentcastId]);
    return r.rows[0] ?? null;
  }

  /** Creates the request and one ask per helper, in the caller's transaction. */
  async createWithAsks(input: {
    kind: BrokerKind;
    askerPersonId: string;
    intentcastId: string | null;
    company: string;
    jobFunction: JobFunction;
    experienceBand: ExperienceBand | null;
    roleTitle: string | null;
    jobUrl: string | null;
    message: string;
    details: NoteDetails | null;
    expiresAt: Date;
    helperIds: string[];
  }): Promise<{ request: BrokerRequestRow; asks: Array<{ id: string; helper_person_id: string }> }> {
    const req = await this.db.query<BrokerRequestRow>(
      `
      INSERT INTO broker_requests (kind, asker_person_id, intentcast_id, company, job_function, experience_band,
        role_title, job_url, message, details, expires_at, asked_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
      RETURNING *
      `,
      [
        input.kind,
        input.askerPersonId,
        input.intentcastId,
        input.company,
        input.jobFunction,
        input.experienceBand,
        input.roleTitle,
        input.jobUrl,
        input.message,
        input.details ? JSON.stringify(input.details) : null,
        input.expiresAt,
        input.helperIds.length
      ]
    );
    const request = req.rows[0]!;
    const asks = await this.db.query<{ id: string; helper_person_id: string }>(
      `
      INSERT INTO broker_asks (request_id, helper_person_id)
      SELECT $1, unnest($2::uuid[])
      ON CONFLICT (request_id, helper_person_id) DO NOTHING
      RETURNING id, helper_person_id
      `,
      [request.id, input.helperIds]
    );
    return { request, asks: asks.rows };
  }

  async setDeliveryChannel(askId: string, channel: "whatsapp"): Promise<void> {
    await this.db.query(`UPDATE broker_asks SET delivery_channel = $2 WHERE id = $1`, [askId, channel]);
  }

  async person(personId: string): Promise<PersonContactRow | null> {
    const r = await this.db.query<PersonContactRow>(
      `SELECT id, full_name, institutional_email::text, personal_email::text, batch_year FROM people WHERE id = $1`,
      [personId]
    );
    return r.rows[0] ?? null;
  }

  async people(personIds: string[]): Promise<PersonContactRow[]> {
    if (personIds.length === 0) return [];
    const r = await this.db.query<PersonContactRow>(
      `SELECT id, full_name, institutional_email::text, personal_email::text, batch_year FROM people WHERE id = ANY($1::uuid[])`,
      [personIds]
    );
    return r.rows;
  }

  async listForAsker(askerPersonId: string, limit: number): Promise<AskerRequestView[]> {
    const r = await this.db.query<BrokerRequestRow & {
      seen_count: string;
      connection_person_id: string | null;
      connection_full_name: string | null;
      connection_contact: string | null;
    }>(
      `
      SELECT br.*,
        (SELECT COUNT(*) FROM broker_asks ba WHERE ba.request_id = br.id AND ba.seen_at IS NOT NULL)::text AS seen_count,
        cr.recipient_person_id AS connection_person_id,
        hp.full_name AS connection_full_name,
        cr.recipient_contact_shared::text AS connection_contact
      FROM broker_requests br
      LEFT JOIN contact_requests cr ON cr.id = br.contact_request_id
      LEFT JOIN people hp ON hp.id = cr.recipient_person_id
      WHERE br.asker_person_id = $1
      ORDER BY br.created_at DESC
      LIMIT $2
      `,
      [askerPersonId, limit]
    );
    return r.rows.map(mapRequestView);
  }

  /**
   * The helper's asks: still-open ones waiting for an answer, plus the ones they said yes to
   * (with the asker's contact). Declined and withdrawn asks drop off.
   */
  async listForHelper(helperPersonId: string, limit: number): Promise<HelperAskView[]> {
    const r = await this.db.query<{
      ask_id: string;
      request_id: string;
      kind: BrokerKind;
      ask_status: BrokerAskStatus;
      request_status: BrokerRequestStatus;
      asked_at: Date;
      expires_at: Date;
      seen_at: Date | null;
      company: string;
      job_function: string;
      experience_band: string | null;
      role_title: string | null;
      job_url: string | null;
      message: string;
      details: NoteDetails | null;
      asker_id: string;
      asker_full_name: string | null;
      asker_email_domain: string | null;
      asker_batch_year: number | null;
      asker_department_code: string | null;
      asker_contact: string | null;
    }>(
      `
      SELECT ba.id AS ask_id, br.id AS request_id, br.kind, ba.status AS ask_status, br.status AS request_status,
        ba.created_at AS asked_at, br.expires_at, ba.seen_at, br.company, br.job_function, br.experience_band,
        br.role_title, br.job_url, br.message, br.details,
        a.id AS asker_id, a.full_name AS asker_full_name,
        split_part(lower(a.institutional_email::text), '@', 2) AS asker_email_domain,
        a.batch_year AS asker_batch_year, d.code AS asker_department_code,
        CASE WHEN ba.status = 'accepted' THEN COALESCE(a.personal_email, a.institutional_email)::text END AS asker_contact
      FROM broker_asks ba
      JOIN broker_requests br ON br.id = ba.request_id
      JOIN people a ON a.id = br.asker_person_id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE ba.helper_person_id = $1
        AND (
          (ba.status = 'asked' AND br.status = 'open' AND br.expires_at > now())
          OR ba.status = 'accepted'
        )
      ORDER BY ba.created_at DESC
      LIMIT $2
      `,
      [helperPersonId, limit]
    );
    return r.rows.map((row) => ({
      askId: row.ask_id,
      requestId: row.request_id,
      kind: row.kind,
      status: row.ask_status,
      requestStatus: row.request_status,
      askedAt: row.asked_at,
      expiresAt: row.expires_at,
      seenAt: row.seen_at,
      company: row.company,
      jobFunction: isJobFunction(row.job_function) ? row.job_function : "other",
      experienceBand: isExperienceBand(row.experience_band) ? row.experience_band : null,
      roleTitle: row.role_title,
      jobUrl: row.job_url,
      message: row.message,
      details: row.details,
      asker: {
        personId: row.asker_id,
        fullName: row.asker_full_name,
        institutionName: row.asker_email_domain ? (DOMAIN_DIRECTORY[row.asker_email_domain]?.institution ?? null) : null,
        batchYear: row.asker_batch_year,
        departmentCode: row.asker_department_code
      },
      askerContact: row.asker_contact
    }));
  }

  async askForResponse(askId: string, lock: boolean): Promise<AskForResponseRow | null> {
    const r = await this.db.query<AskForResponseRow>(
      `
      SELECT ba.id AS ask_id, ba.status AS ask_status, ba.helper_person_id, br.id AS request_id,
        br.status AS request_status, br.expires_at
      FROM broker_asks ba JOIN broker_requests br ON br.id = ba.request_id
      WHERE ba.id = $1
      ${lock ? "FOR UPDATE OF br, ba" : ""}
      `,
      [askId]
    );
    return r.rows[0] ?? null;
  }

  async request(requestId: string): Promise<BrokerRequestRow | null> {
    const r = await this.db.query<BrokerRequestRow>(`SELECT * FROM broker_requests WHERE id = $1`, [requestId]);
    return r.rows[0] ?? null;
  }

  /**
   * Marks the ask seen (once). Returns the request when this was the first time anyone saw it,
   * so the asker can be told; null otherwise.
   */
  async markSeen(askId: string, helperPersonId: string): Promise<{ marked: boolean; firstForRequest: BrokerRequestRow | null }> {
    const seen = await this.db.query<{ request_id: string }>(
      `UPDATE broker_asks SET seen_at = now() WHERE id = $1 AND helper_person_id = $2 AND seen_at IS NULL RETURNING request_id`,
      [askId, helperPersonId]
    );
    const requestId = seen.rows[0]?.request_id;
    if (!requestId) return { marked: false, firstForRequest: null };
    const first = await this.db.query<BrokerRequestRow>(
      `UPDATE broker_requests SET first_seen_at = now() WHERE id = $1 AND first_seen_at IS NULL AND status = 'open' RETURNING *`,
      [requestId]
    );
    return { marked: true, firstForRequest: first.rows[0] ?? null };
  }

  async setAskAnswer(askId: string, status: "accepted" | "declined"): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE broker_asks SET status = $2, responded_at = now() WHERE id = $1 AND status = 'asked'`,
      [askId, status]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Everyone else still asked is told it's taken care of. Returns the helpers withdrawn. */
  async withdrawOthers(requestId: string, exceptAskId: string | null): Promise<string[]> {
    const r = await this.db.query<{ helper_person_id: string }>(
      `
      UPDATE broker_asks SET status = 'withdrawn', responded_at = now()
      WHERE request_id = $1 AND status = 'asked' AND ($2::uuid IS NULL OR id <> $2::uuid)
      RETURNING helper_person_id
      `,
      [requestId, exceptAskId]
    );
    return r.rows.map((row) => row.helper_person_id);
  }

  /** The connection: an accepted reachout from the asker to the helper, created already accepted. */
  async insertAcceptedReachout(input: {
    askerPersonId: string;
    helperPersonId: string;
    helperInstitutionalEmail: string;
    message: string;
    details: NoteDetails | null;
    source: "referral_request" | "hiring_request";
    sourceCategory: string | null;
    contactShared: string;
  }): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `
      INSERT INTO contact_requests (sender_person_id, recipient_person_id, message, details, status,
        recipient_contact_shared, forwarded_to_institutional_email, responded_at, source, source_category)
      VALUES ($1, $2, $3, $4::jsonb, 'accepted', $5, $6, now(), $7, $8)
      RETURNING id
      `,
      [
        input.askerPersonId,
        input.helperPersonId,
        input.message,
        input.details ? JSON.stringify(input.details) : null,
        input.contactShared,
        input.helperInstitutionalEmail,
        input.source,
        input.sourceCategory
      ]
    );
    return r.rows[0]!.id;
  }

  async markConnected(requestId: string, contactRequestId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE broker_requests SET status = 'connected', connected_at = now(), contact_request_id = $2 WHERE id = $1 AND status = 'open'`,
      [requestId, contactRequestId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Closes open requests whose window has passed and withdraws their asks. Returns the closed requests. */
  async expireDue(limit: number): Promise<BrokerRequestRow[]> {
    const r = await this.db.query<BrokerRequestRow>(
      `
      WITH due AS (
        SELECT id FROM broker_requests
        WHERE status = 'open' AND expires_at <= now()
        ORDER BY expires_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ), closed AS (
        UPDATE broker_requests br SET status = 'expired', expired_at = now()
        FROM due WHERE br.id = due.id
        RETURNING br.*
      ), withdrawn AS (
        UPDATE broker_asks ba SET status = 'withdrawn', responded_at = now()
        FROM closed WHERE ba.request_id = closed.id AND ba.status = 'asked'
        RETURNING ba.id
      )
      SELECT * FROM closed
      `,
      [limit]
    );
    return r.rows;
  }

  /** Requests that closed with nobody found, for the asker's notifications. */
  async expiredForAsker(askerPersonId: string, limit: number): Promise<BrokerRequestRow[]> {
    const r = await this.db.query<BrokerRequestRow>(
      `SELECT * FROM broker_requests WHERE asker_person_id = $1 AND status = 'expired' ORDER BY expired_at DESC LIMIT $2`,
      [askerPersonId, limit]
    );
    return r.rows;
  }

  async countExpiredForAsker(askerPersonId: string): Promise<number> {
    const r = await this.db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM broker_requests WHERE asker_person_id = $1 AND status = 'expired'`,
      [askerPersonId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async countOpenAsksForHelper(helperPersonId: string): Promise<number> {
    const r = await this.db.query<{ n: string }>(
      `
      SELECT COUNT(*)::text AS n FROM broker_asks ba JOIN broker_requests br ON br.id = ba.request_id
      WHERE ba.helper_person_id = $1 AND ba.status = 'asked' AND br.status = 'open' AND br.expires_at > now()
      `,
      [helperPersonId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async getSetting(key: string): Promise<unknown> {
    const r = await this.db.query<{ value: unknown }>(`SELECT value FROM app_settings WHERE key = $1`, [key]);
    return r.rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: unknown, actorPersonId: string | null): Promise<void> {
    await this.db.query(
      `
      INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [key, JSON.stringify(value), actorPersonId]
    );
  }
}
