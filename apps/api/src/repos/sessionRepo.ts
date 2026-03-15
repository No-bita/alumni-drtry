import type { DbExecutor } from "../db/types.js";

export interface SessionRow {
  id: string;
  person_id: string;
  session_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_ip: string | null;
  created_user_agent: string | null;
  rotated_from: string | null;
  created_at: Date;
  last_seen_at: Date;
}

export interface CreateSessionInput {
  personId: string;
  sessionHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  rotatedFromSessionId?: string;
}

export interface SessionWithPersonRow extends SessionRow {
  institutional_email: string;
  role: "alumni" | "admin";
  department_code: string | null;
  department_name: string | null;
  joining_year: number | null;
}

export class SessionRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const result = await this.db.query<SessionRow>(
      `
      INSERT INTO sessions (
        person_id, session_hash, expires_at, created_ip, created_user_agent, rotated_from
      )
      VALUES ($1, $2, $3, $4::INET, $5, $6)
      RETURNING *
      `,
      [
        input.personId,
        input.sessionHash,
        input.expiresAt,
        input.ipAddress,
        input.userAgent,
        input.rotatedFromSessionId ?? null
      ]
    );
    return result.rows[0]!;
  }

  async findActiveByHash(sessionHash: string): Promise<SessionWithPersonRow | null> {
    const result = await this.db.query<SessionWithPersonRow>(
      `
      SELECT s.*, p.institutional_email, p.role, p.department_code, p.department_name, p.joining_year
      FROM sessions s
      JOIN people p ON p.id = s.person_id
      WHERE s.session_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      LIMIT 1
      `,
      [sessionHash]
    );
    return result.rows[0] ?? null;
  }

  async revokeByHash(sessionHash: string): Promise<void> {
    await this.db.query(
      `
      UPDATE sessions
      SET revoked_at = now()
      WHERE session_hash = $1
        AND revoked_at IS NULL
      `,
      [sessionHash]
    );
  }

  async revokeAllByPersonId(personId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE sessions
      SET revoked_at = now()
      WHERE person_id = $1
        AND revoked_at IS NULL
      `,
      [personId]
    );
  }

  async touch(sessionId: string): Promise<void> {
    await this.db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [sessionId]);
  }
}
