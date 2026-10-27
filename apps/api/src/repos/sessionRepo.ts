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
  /** How the member signed in (analytics). Omitted for rotations, which keep no method. */
  authMethod?: SessionAuthMethod;
}

export type SessionAuthMethod = "otp" | "magic_link" | "google" | "password" | "invite" | "demo";

export interface SessionWithPersonRow extends SessionRow {
  institutional_email: string;
  role: "alumni" | "admin" | "super_admin";
  department_code: string | null;
  department_name: string | null;
  joining_year: number | null;
  is_demo: boolean;
}

export class SessionRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(input: CreateSessionInput): Promise<SessionRow> {
    // Signing in counts as using the app today (member_activity_days, for active-member trends).
    const result = await this.db.query<SessionRow>(
      `
      WITH s AS (
        INSERT INTO sessions (
          person_id, session_hash, expires_at, created_ip, created_user_agent, rotated_from, auth_method
        )
        VALUES ($1, $2, $3, $4::INET, $5, $6, $7)
        RETURNING *
      ), activity AS (
        INSERT INTO member_activity_days (person_id, day)
        SELECT person_id, current_date FROM s
        ON CONFLICT DO NOTHING
      )
      SELECT * FROM s
      `,
      [
        input.personId,
        input.sessionHash,
        input.expiresAt,
        input.ipAddress,
        input.userAgent,
        input.rotatedFromSessionId ?? null,
        input.authMethod ?? null
      ]
    );
    return result.rows[0]!;
  }

  async findActiveByHash(sessionHash: string, hardCapHours: number): Promise<SessionWithPersonRow | null> {
    const result = await this.db.query<SessionWithPersonRow>(
      `
      SELECT s.*, p.institutional_email, p.role, p.department_code, p.department_name, p.joining_year, p.is_demo
      FROM sessions s
      JOIN people p ON p.id = s.person_id
      WHERE s.session_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.created_at + ($2::double precision * interval '1 hour') > now()
      LIMIT 1
      `,
      [sessionHash, hardCapHours]
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

  /**
   * Extends sliding `expires_at` (capped at created_at + hardCapHours) and updates `last_seen_at`,
   * but only if last_seen_at is at least `throttleSeconds` ago — reduces write load on hot paths.
   */
  async touchSlidingThrottled(input: {
    sessionId: string;
    throttleSeconds: number;
    slidingHours: number;
    hardCapHours: number;
  }): Promise<void> {
    // The same throttled write also marks today as an active day for the member.
    await this.db.query(
      `
      WITH touched AS (
      UPDATE sessions s
      SET
        last_seen_at = now(),
        expires_at = LEAST(
          now() + ($3::double precision * interval '1 hour'),
          s.created_at + ($4::double precision * interval '1 hour')
        )
      WHERE s.id = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.created_at + ($4::double precision * interval '1 hour') > now()
        AND s.last_seen_at <= now() - ($2::double precision * interval '1 second')
      RETURNING s.person_id
      )
      INSERT INTO member_activity_days (person_id, day)
      SELECT person_id, current_date FROM touched
      ON CONFLICT DO NOTHING
      `,
      [input.sessionId, input.throttleSeconds, input.slidingHours, input.hardCapHours]
    );
  }
}
