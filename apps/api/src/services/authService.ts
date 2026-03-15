import type { Pool } from "pg";
import { env } from "../config/env.js";
import { generateOpaqueToken, generateOtp, hashSecret, verifySecret } from "../lib/crypto.js";
import { isInstitutionalEmailAllowed, normalizeEmail, parseAllowedDomains } from "../lib/domainAllowlist.js";
import { parseInstitutionalIdentity } from "../lib/emailParser.js";
import { AppError } from "../lib/errors.js";
import { AuthChallengeRepo } from "../repos/authChallengeRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import { SessionRepo } from "../repos/sessionRepo.js";
import type { EmailSender } from "./emailSender.js";

export interface StartAuthInput {
  institutionalEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface StartAuthResult {
  challengeId: string;
  sentTo: string;
  debug?: {
    otp: string;
    magicLinkUrl: string;
  };
}

export interface VerifyAuthInput {
  challengeId: string;
  otp?: string;
  magicLinkToken?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface VerifyAuthResult {
  sessionToken: string;
  sessionExpiresAt: Date;
  person: {
    id: string;
    institutionalEmail: string;
    departmentCode: string | null;
    departmentName: string | null;
    joiningYear: number | null;
  };
}

export interface SessionActor {
  personId: string;
  institutionalEmail: string;
  role: "alumni" | "admin";
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
}

export class AuthService {
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly authChallengeRepo: AuthChallengeRepo;
  private readonly sessionRepo: SessionRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.allowedDomains = parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS);
    this.authChallengeRepo = new AuthChallengeRepo(pool);
    this.sessionRepo = new SessionRepo(pool);
  }

  async startAuth(input: StartAuthInput): Promise<StartAuthResult> {
    const institutionalEmail = normalizeEmail(input.institutionalEmail);

    if (!isInstitutionalEmailAllowed(institutionalEmail, this.allowedDomains)) {
      throw new AppError(400, "AUTH_DOMAIN_NOT_ALLOWED", "Use an IIT BHU institutional email address.");
    }

    const [recentByEmail, recentByIp] = await Promise.all([
      this.authChallengeRepo.countRecentByEmail(institutionalEmail, env.AUTH_START_WINDOW_MINUTES),
      input.ipAddress
        ? this.authChallengeRepo.countRecentByIp(input.ipAddress, env.AUTH_START_WINDOW_MINUTES)
        : Promise.resolve(0)
    ]);

    const retryAfterSeconds = env.AUTH_START_WINDOW_MINUTES * 60;
    if (recentByEmail >= env.AUTH_START_MAX_PER_EMAIL_WINDOW) {
      throw new AppError(
        429,
        "AUTH_RATE_LIMITED",
        "Too many authentication attempts. Try again later.",
        true,
        retryAfterSeconds
      );
    }
    if (recentByIp >= env.AUTH_START_MAX_PER_IP_WINDOW) {
      throw new AppError(
        429,
        "AUTH_RATE_LIMITED",
        "Too many authentication attempts. Try again later.",
        true,
        retryAfterSeconds
      );
    }

    const otp = generateOtp(6);
    const magicLinkToken = generateOpaqueToken(32);
    const now = Date.now();
    const otpExpiresAt = new Date(now + env.OTP_TTL_MINUTES * 60_000);
    const magicLinkExpiresAt = new Date(now + env.MAGIC_LINK_TTL_MINUTES * 60_000);
    const otpHash = hashSecret(otp, env.AUTH_SECRET_PEPPER);
    const magicLinkHash = hashSecret(magicLinkToken, env.AUTH_SECRET_PEPPER);

    const challenge = await this.authChallengeRepo.create({
      institutionalEmail,
      otpHash,
      otpExpiresAt,
      magicLinkHash,
      magicLinkExpiresAt,
      maxAttempts: env.AUTH_CHALLENGE_MAX_ATTEMPTS,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    const magicLinkBase = env.MAGIC_LINK_BASE_URL ?? env.APP_BASE_URL;
    const magicLinkUrl = `${magicLinkBase}/auth/verify?challengeId=${encodeURIComponent(challenge.id)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`;
    try {
      await this.emailSender.sendAuthEmail({
        to: institutionalEmail,
        otp,
        magicLinkUrl,
        otpExpiresAt,
        magicLinkExpiresAt
      });
    } catch {
      await this.authChallengeRepo.deleteById(challenge.id);
      throw new AppError(503, "AUTH_DELIVERY_FAILED", "Unable to deliver authentication email. Try again.");
    }

    return {
      challengeId: challenge.id,
      sentTo: institutionalEmail,
      ...(env.SHOW_AUTH_SECRETS_IN_RESPONSE
        ? {
            debug: {
              otp,
              magicLinkUrl
            }
          }
        : {})
    };
  }

  async verifyAuth(input: VerifyAuthInput): Promise<VerifyAuthResult> {
    const hasOtp = typeof input.otp === "string" && input.otp.length > 0;
    const hasMagicLink = typeof input.magicLinkToken === "string" && input.magicLinkToken.length > 0;
    if ((hasOtp && hasMagicLink) || (!hasOtp && !hasMagicLink)) {
      throw new AppError(400, "AUTH_BAD_REQUEST", "Provide exactly one credential: otp or magicLinkToken.");
    }

    const client = await this.pool.connect();
    let shouldRollback = true;

    try {
      await client.query("BEGIN");
      const challengeRepo = new AuthChallengeRepo(client);
      const personRepo = new PersonRepo(client);
      const sessionRepo = new SessionRepo(client);

      const challenge = await challengeRepo.findByIdForUpdate(input.challengeId);
      if (!challenge || challenge.consumed_at) {
        throw new AppError(401, "AUTH_INVALID_CHALLENGE", "Invalid or expired authentication challenge.");
      }
      if (challenge.attempts >= challenge.max_attempts) {
        throw new AppError(429, "AUTH_TOO_MANY_ATTEMPTS", "Challenge exhausted. Request a new one.");
      }

      const nowMs = Date.now();
      const expectedHash = hasOtp ? challenge.otp_hash : challenge.magic_link_hash;
      const submitted = hasOtp ? input.otp! : input.magicLinkToken!;
      const expiresAt = hasOtp ? challenge.otp_expires_at : challenge.magic_link_expires_at;

      if (expiresAt.getTime() < nowMs) {
        await challengeRepo.incrementAttempts(challenge.id);
        await client.query("COMMIT");
        shouldRollback = false;
        throw new AppError(401, "AUTH_EXPIRED", "Authentication token has expired.");
      }

      const verified = verifySecret(submitted, expectedHash, env.AUTH_SECRET_PEPPER);
      if (!verified) {
        await challengeRepo.incrementAttempts(challenge.id);
        await client.query("COMMIT");
        shouldRollback = false;
        throw new AppError(401, "AUTH_INVALID_TOKEN", "Invalid authentication token.");
      }

      await challengeRepo.markConsumed(challenge.id);
      const parsedIdentity = parseInstitutionalIdentity(challenge.institutional_email);
      const person = await personRepo.upsertByInstitutionalEmail({
        institutionalEmail: parsedIdentity.normalizedEmail,
        departmentCode: parsedIdentity.departmentCode,
        departmentName: parsedIdentity.departmentName,
        joiningYear: parsedIdentity.joiningYear
      });

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const sessionExpiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
      await sessionRepo.create({
        personId: person.id,
        sessionHash,
        expiresAt: sessionExpiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });

      await client.query("COMMIT");
      shouldRollback = false;

      return {
        sessionToken,
        sessionExpiresAt,
        person: {
          id: person.id,
          institutionalEmail: person.institutional_email,
          departmentCode: person.department_code,
          departmentName: person.department_name,
          joiningYear: person.joining_year
        }
      };
    } catch (error) {
      if (shouldRollback) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getActorFromSessionToken(sessionToken: string): Promise<SessionActor | null> {
    const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
    const row = await this.sessionRepo.findActiveByHash(sessionHash);
    if (!row) {
      return null;
    }
    await this.sessionRepo.touch(row.id);
    return {
      personId: row.person_id,
      institutionalEmail: row.institutional_email,
      role: row.role,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      joiningYear: row.joining_year
    };
  }

  async logout(sessionToken: string): Promise<void> {
    const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
    await this.sessionRepo.revokeByHash(sessionHash);
  }
}
