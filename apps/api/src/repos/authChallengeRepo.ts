import type { DbExecutor } from "../db/types.js";

export interface AuthChallengeRow {
  id: string;
  institutional_email: string;
  otp_hash: string;
  otp_expires_at: Date;
  magic_link_hash: string;
  magic_link_expires_at: Date;
  attempts: number;
  max_attempts: number;
  consumed_at: Date | null;
  /** Set when a newer code was emailed for the same address (migration 049). */
  superseded_at: Date | null;
  created_ip: string | null;
  created_user_agent: string | null;
  created_at: Date;
}

export interface CreateChallengeInput {
  institutionalEmail: string;
  otpHash: string;
  otpExpiresAt: Date;
  magicLinkHash: string;
  magicLinkExpiresAt: Date;
  maxAttempts: number;
  ipAddress: string | null;
  userAgent: string | null;
}

export class AuthChallengeRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(input: CreateChallengeInput): Promise<AuthChallengeRow> {
    const result = await this.db.query<AuthChallengeRow>(
      `
      INSERT INTO auth_challenges (
        institutional_email, otp_hash, otp_expires_at,
        magic_link_hash, magic_link_expires_at, max_attempts,
        created_ip, created_user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        input.institutionalEmail,
        input.otpHash,
        input.otpExpiresAt,
        input.magicLinkHash,
        input.magicLinkExpiresAt,
        input.maxAttempts,
        input.ipAddress,
        input.userAgent
      ]
    );
    return result.rows[0]!;
  }

  /**
   * Latest still-usable challenge for an email: unconsumed and unexpired (the OTP
   * lifetime is the tighter bound). Used to recognise a rapid repeat start as the
   * same sign-in attempt instead of minting - and emailing - a new challenge.
   */
  async findLatestActiveByEmail(institutionalEmail: string): Promise<AuthChallengeRow | null> {
    const result = await this.db.query<AuthChallengeRow>(
      `
      SELECT * FROM auth_challenges
      WHERE institutional_email = $1
        AND consumed_at IS NULL
        AND superseded_at IS NULL
        AND otp_expires_at > now()
        AND attempts < max_attempts
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [institutionalEmail]
    );
    return result.rows[0] ?? null;
  }

  /** Retire every other open code for this email: only the newest email's code and link work. */
  async supersedeOthersByEmail(institutionalEmail: string, keepChallengeId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE auth_challenges
      SET superseded_at = now()
      WHERE institutional_email = $1
        AND id <> $2
        AND consumed_at IS NULL
        AND superseded_at IS NULL
      `,
      [institutionalEmail, keepChallengeId]
    );
  }

  /** Recently retired codes for an email, to tell "old code" apart from "wrong code". */
  async findRecentSupersededByEmail(institutionalEmail: string): Promise<Pick<AuthChallengeRow, "id" | "otp_hash">[]> {
    const result = await this.db.query<Pick<AuthChallengeRow, "id" | "otp_hash">>(
      `
      SELECT id, otp_hash FROM auth_challenges
      WHERE institutional_email = $1
        AND superseded_at IS NOT NULL
        AND consumed_at IS NULL
        AND otp_expires_at > now()
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [institutionalEmail]
    );
    return result.rows;
  }

  /** Analytics: how this attempt's email went ("sent" or "unconfirmed"). */
  async setDelivery(challengeId: string, delivery: "sent" | "unconfirmed"): Promise<void> {
    await this.db.query(`UPDATE auth_challenges SET delivery = $2 WHERE id = $1`, [challengeId, delivery]);
  }

  /** Analytics: a send that failed outright (its attempt was rolled back). No address is stored. */
  async recordDeliveryFailure(reason: "rejected" | "unreachable"): Promise<void> {
    await this.db.query(`INSERT INTO auth_delivery_failures (reason) VALUES ($1)`, [reason]);
  }

  async findByIdForUpdate(challengeId: string): Promise<AuthChallengeRow | null> {
    const result = await this.db.query<AuthChallengeRow>(
      `SELECT * FROM auth_challenges WHERE id = $1 FOR UPDATE`,
      [challengeId]
    );
    return result.rows[0] ?? null;
  }

  async incrementAttempts(challengeId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE auth_challenges
      SET attempts = attempts + 1
      WHERE id = $1
      `,
      [challengeId]
    );
  }

  async markConsumed(challengeId: string): Promise<void> {
    await this.db.query(
      `
      UPDATE auth_challenges
      SET consumed_at = now()
      WHERE id = $1
      `,
      [challengeId]
    );
  }

  async deleteById(challengeId: string): Promise<void> {
    await this.db.query(`DELETE FROM auth_challenges WHERE id = $1`, [challengeId]);
  }

  async countRecentByEmail(institutionalEmail: string, windowMinutes: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::TEXT AS count
      FROM auth_challenges
      WHERE institutional_email = $1
        AND created_at >= now() - ($2::TEXT || ' minutes')::INTERVAL
      `,
      [institutionalEmail, windowMinutes]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async countRecentByIp(ipAddress: string, windowMinutes: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::TEXT AS count
      FROM auth_challenges
      WHERE created_ip = $1::INET
        AND created_at >= now() - ($2::TEXT || ' minutes')::INTERVAL
      `,
      [ipAddress, windowMinutes]
    );
    return Number(result.rows[0]?.count ?? "0");
  }
      }
