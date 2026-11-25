import type { DbExecutor } from "../db/types.js";
import type { PersonRole } from "../lib/viewAs.js";

export interface ViewAsSessionRow {
  id: string;
  admin_person_id: string;
  target_person_id: string;
  created_at: Date;
  expires_at: Date;
  ended_at: Date | null;
}

export interface ViewAsTargetRow {
  id: string;
  institutional_email: string;
  full_name: string | null;
  role: PersonRole;
  department_code: string | null;
  department_name: string | null;
  joining_year: number | null;
  is_demo: boolean;
}

export interface ViewAsPersonSearchRow {
  id: string;
  full_name: string | null;
  institutional_email: string;
  batch_year: number | null;
  department_code: string | null;
  role: PersonRole;
  suspended_at: Date | null;
}

export class ViewAsRepo {
  constructor(private readonly db: DbExecutor) {}

  async createSession(input: {
    tokenHash: string;
    adminPersonId: string;
    targetPersonId: string;
    ttlMinutes: number;
    ip: string | null;
    userAgent: string | null;
  }): Promise<ViewAsSessionRow> {
    const result = await this.db.query<ViewAsSessionRow>(
      `
      INSERT INTO admin_view_as_sessions
        (token_hash, admin_person_id, target_person_id, expires_at, created_ip, created_user_agent)
      VALUES ($1, $2, $3, now() + ($4::double precision * interval '1 minute'), $5::INET, $6)
      RETURNING id, admin_person_id, target_person_id, created_at, expires_at, ended_at
      `,
      [input.tokenHash, input.adminPersonId, input.targetPersonId, input.ttlMinutes, input.ip, input.userAgent]
    );
    return result.rows[0]!;
  }

  /** Not ended and not expired. */
  async findActiveByHash(tokenHash: string): Promise<ViewAsSessionRow | null> {
    const result = await this.db.query<ViewAsSessionRow>(
      `
      SELECT id, admin_person_id, target_person_id, created_at, expires_at, ended_at
      FROM admin_view_as_sessions
      WHERE token_hash = $1
        AND ended_at IS NULL
        AND expires_at > now()
      LIMIT 1
      `,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  /** Ends the session if it was still open (expired ones are ended too, for a complete record). */
  async endByHash(tokenHash: string): Promise<ViewAsSessionRow | null> {
    const result = await this.db.query<ViewAsSessionRow>(
      `
      UPDATE admin_view_as_sessions
      SET ended_at = now()
      WHERE token_hash = $1
        AND ended_at IS NULL
      RETURNING id, admin_person_id, target_person_id, created_at, expires_at, ended_at
      `,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  }

  async insertAudit(input: {
    sessionId: string;
    event: "start" | "end";
    adminPersonId: string;
    targetPersonId: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await this.db.query(
      `
      INSERT INTO admin_view_as_audit (session_id, event, admin_person_id, target_person_id, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5::INET, $6)
      `,
      [input.sessionId, input.event, input.adminPersonId, input.targetPersonId, input.ip, input.userAgent]
    );
  }

  /** The member being viewed (not deleted). */
  async findTarget(personId: string): Promise<ViewAsTargetRow | null> {
    const result = await this.db.query<ViewAsTargetRow>(
      `
      SELECT id, institutional_email, full_name, role, department_code, department_name, joining_year, is_demo
      FROM people
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [personId]
    );
    return result.rows[0] ?? null;
  }

  /** Name or sign-in email contains the text (case-insensitive); deleted accounts excluded. */
  async searchPeople(q: string, excludePersonId: string, limit: number): Promise<ViewAsPersonSearchRow[]> {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const result = await this.db.query<ViewAsPersonSearchRow>(
      `
      SELECT id, full_name, institutional_email::text AS institutional_email, batch_year, department_code, role, suspended_at
      FROM people
      WHERE deleted_at IS NULL
        AND id <> $2
        AND (full_name ILIKE $1 OR institutional_email::text ILIKE $1)
      ORDER BY full_name NULLS LAST, institutional_email
      LIMIT $3
      `,
      [pattern, excludePersonId, limit]
    );
    return result.rows;
  }
}
