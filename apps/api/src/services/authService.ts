import type { Pool } from "pg";
import { isTestInstitutionalEmail } from "../lib/testUser.js";
import { env } from "../config/env.js";
import { generateOpaqueToken, generateOtp, hashSecret, verifySecret } from "../lib/crypto.js";
import { isInstitutionalEmailAllowed, normalizeEmail, parseAllowedDomains } from "../lib/domainAllowlist.js";
import { parseInstitutionalIdentity } from "../lib/emailParser.js";
import { AppError } from "../lib/errors.js";
import { AuthChallengeRepo, type AuthChallengeRow } from "../repos/authChallengeRepo.js";
import { AdminAllowedEmailRepo } from "../repos/adminAllowedEmailRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import { SessionRepo } from "../repos/sessionRepo.js";
import type { EmailSender } from "./emailSender.js";
import {
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserInfo
} from "../lib/googleOAuth.js";

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

export interface PasswordLoginInput {
  institutionalEmail: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface InviteCodeLoginInput {
  institutionalEmail: string;
  inviteCode: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DemoLoginInput {
  email: string;
  password: string;
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
    isDemo?: boolean;
  };
}

export interface SessionActor {
  personId: string;
  institutionalEmail: string;
  role: "alumni" | "admin" | "super_admin";
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
  isDemo?: boolean;
}

/** Initial expiry: sliding window from login, capped at hard max since session creation. */
function newSessionExpiresAt(createdAtMs: number): Date {
  return new Date(
    Math.min(
      createdAtMs + env.SESSION_SLIDING_HOURS * 3_600_000,
      createdAtMs + env.SESSION_HARD_CAP_HOURS * 3_600_000
    )
  );
}

export class AuthService {
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly authChallengeRepo: AuthChallengeRepo;
  private readonly sessionRepo: SessionRepo;
  private readonly adminAllowedEmailRepo: AdminAllowedEmailRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.allowedDomains = parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS);
    this.authChallengeRepo = new AuthChallengeRepo(pool);
    this.sessionRepo = new SessionRepo(pool);
    this.adminAllowedEmailRepo = new AdminAllowedEmailRepo(pool);
  }

  private async maybePromoteToAdminByAllowlist(
    personRepo: PersonRepo,
    personId: string,
    institutionalEmail: string,
    currentRole: "alumni" | "admin" | "super_admin"
  ): Promise<"alumni" | "admin" | "super_admin"> {
    if (currentRole !== "alumni") return currentRole;
    const allowed = await this.adminAllowedEmailRepo.isAllowed(institutionalEmail);
    if (!allowed) return currentRole;
    const updated = await personRepo.updateAdminFields(personId, { role: "admin" });
    return updated?.role ?? "admin";
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

    // A rapid repeat start for the same email - the client retrying after the proxy
    // dropped a response the server had already processed, or a double submit - must
    // not send another email for the same sign-in attempt: return the still-active
    // challenge created moments ago instead of minting (and emailing) a new one.
    // The advisory lock serializes concurrent starts for the same email so two
    // simultaneous requests cannot both miss the lookup and each send an email.
    const client = await this.pool.connect();
    let challenge: AuthChallengeRow;
    let magicLinkUrl: string;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [institutionalEmail]);
      const txChallengeRepo = new AuthChallengeRepo(client);
      const active = await txChallengeRepo.findLatestActiveByEmail(institutionalEmail);
      const duplicateWindowMs = env.AUTH_START_DUPLICATE_WINDOW_SECONDS * 1000;
      if (active && duplicateWindowMs > 0 && now - active.created_at.getTime() <= duplicateWindowMs) {
        await client.query("COMMIT");
        // Same attempt: the email already sent for this challenge is still valid.
        // Debug secrets only exist when a challenge is minted - only hashes are stored.
        return { challengeId: active.id, sentTo: institutionalEmail };
      }
      challenge = await txChallengeRepo.create({
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
      magicLinkUrl = `${magicLinkBase}/auth/verify?challengeId=${encodeURIComponent(challenge.id)}&magicLinkToken=${encodeURIComponent(magicLinkToken)}`;
      // Send inside the transaction: a failed send rolls the new challenge back, so a
      // repeat start can never be pointed at a challenge whose email never went out.
      try {
        await this.emailSender.sendAuthEmail({
          to: institutionalEmail,
          otp,
          magicLinkUrl,
          otpExpiresAt,
          magicLinkExpiresAt
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[auth] sendAuthEmail failed:", detail);
        throw new AppError(503, "AUTH_DELIVERY_FAILED", "Unable to deliver authentication email. Try again.");
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
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

  /**
   * OAuth 2.0 authorization-code callback: verifies Google account, requires verified @allowed-domain email,
   * then creates a session the same way as magic-link / OTP verification.
   */
  async signInWithGoogle(input: {
    code: string;
    redirectUri: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<VerifyAuthResult> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new AppError(503, "AUTH_GOOGLE_DISABLED", "Google sign-in is not configured.");
    }

    const accessToken = await exchangeGoogleAuthorizationCode({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      code: input.code,
      redirectUri: input.redirectUri
    });

    const userInfo = await fetchGoogleUserInfo(accessToken);
    const emailRaw = userInfo.email;
    if (!emailRaw || !userInfo.email_verified) {
      throw new AppError(
        403,
        "AUTH_GOOGLE_EMAIL_UNVERIFIED",
        "Your Google account must have a verified email address to sign in."
      );
    }

    const institutionalEmail = normalizeEmail(emailRaw);
    if (!isInstitutionalEmailAllowed(institutionalEmail, this.allowedDomains)) {
      throw new AppError(400, "AUTH_DOMAIN_NOT_ALLOWED", "Use an IIT BHU institutional email address.");
    }

    const client = await this.pool.connect();
    let shouldRollback = true;

    try {
      await client.query("BEGIN");
      const personRepo = new PersonRepo(client);
      const sessionRepo = new SessionRepo(client);

      const parsedIdentity = parseInstitutionalIdentity(institutionalEmail);
      const person = await personRepo.upsertByInstitutionalEmail({
        institutionalEmail: parsedIdentity.normalizedEmail,
        departmentCode: parsedIdentity.departmentCode,
        departmentName: parsedIdentity.departmentName,
        joiningYear: parsedIdentity.joiningYear,
        isTestUser: isTestInstitutionalEmail(parsedIdentity.normalizedEmail)
      });
      person.role = await this.maybePromoteToAdminByAllowlist(
        personRepo,
        person.id,
        parsedIdentity.normalizedEmail,
        person.role
      );

      await personRepo.incrementAppLoginCount(person.id);

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const createdAtMs = Date.now();
      const sessionExpiresAt = newSessionExpiresAt(createdAtMs);
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

  /**
   * Optional password fallback for a single configured email.
   * This does not replace OTP/magic-link; it's an explicit fallback gated by ENABLE_PASSWORD_LOGIN.
   */
  async loginWithDevPassword(input: PasswordLoginInput): Promise<VerifyAuthResult> {
    if (!env.ENABLE_PASSWORD_LOGIN) {
      throw new AppError(403, "AUTH_PASSWORD_DISABLED", "Password login is disabled.");
    }
    if (!env.DEV_PASSWORD_LOGIN_EMAIL || !env.DEV_PASSWORD_LOGIN_PASSWORD_HASH) {
      throw new AppError(403, "AUTH_PASSWORD_DISABLED", "Password login is not configured.");
    }

    const institutionalEmail = normalizeEmail(input.institutionalEmail);
    if (institutionalEmail !== env.DEV_PASSWORD_LOGIN_EMAIL) {
      throw new AppError(403, "AUTH_PASSWORD_DISABLED", "Password login is unavailable for this email.");
    }
    if (!isInstitutionalEmailAllowed(institutionalEmail, this.allowedDomains)) {
      throw new AppError(400, "AUTH_DOMAIN_NOT_ALLOWED", "Use an IIT BHU institutional email address.");
    }

    const submittedHash = hashSecret(input.password, env.AUTH_SECRET_PEPPER);
    if (submittedHash !== env.DEV_PASSWORD_LOGIN_PASSWORD_HASH) {
      throw new AppError(401, "AUTH_INVALID_PASSWORD", "Incorrect password.");
    }

    const client = await this.pool.connect();
    let shouldRollback = true;
    try {
      await client.query("BEGIN");
      const personRepo = new PersonRepo(client);
      const sessionRepo = new SessionRepo(client);

      const parsedIdentity = parseInstitutionalIdentity(institutionalEmail);
      const person = await personRepo.upsertByInstitutionalEmail({
        institutionalEmail: parsedIdentity.normalizedEmail,
        departmentCode: parsedIdentity.departmentCode,
        departmentName: parsedIdentity.departmentName,
        joiningYear: parsedIdentity.joiningYear,
        isTestUser: isTestInstitutionalEmail(parsedIdentity.normalizedEmail)
      });
      person.role = await this.maybePromoteToAdminByAllowlist(
        personRepo,
        person.id,
        parsedIdentity.normalizedEmail,
        person.role
      );

      await personRepo.incrementAppLoginCount(person.id);

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const createdAtMs = Date.now();
      const sessionExpiresAt = newSessionExpiresAt(createdAtMs);
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

  /**
   * Dedicated demo login with email + password for prospective partners/investors and guided tours.
   * Gated by DEMO_AUTH_ENABLED, matches configured DEMO_AUTH_EMAIL, and verifies against DEMO_AUTH_PASSWORD_HASH.
   * Does NOT auto-create a user, never promotes to admin, and fails closed when unconfigured or unprovisioned.
   */
  async loginWithDemoCredentials(input: DemoLoginInput): Promise<VerifyAuthResult> {
    if (!env.DEMO_AUTH_ENABLED) {
      throw new AppError(403, "DEMO_AUTH_DISABLED", "Demo login is disabled.");
    }
    if (!env.DEMO_AUTH_EMAIL || !env.DEMO_AUTH_PASSWORD_HASH) {
      throw new AppError(503, "DEMO_AUTH_MISCONFIGURED", "Demo login is not configured.");
    }

    const email = normalizeEmail(input.email);
    const expectedEmail = normalizeEmail(env.DEMO_AUTH_EMAIL);
    if (email !== expectedEmail) {
      throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Incorrect demo credentials.");
    }

    if (!verifySecret(input.password, env.DEMO_AUTH_PASSWORD_HASH, env.AUTH_SECRET_PEPPER)) {
      throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Incorrect demo credentials.");
    }

    const client = await this.pool.connect();
    let shouldRollback = true;
    try {
      await client.query("BEGIN");
      const personRepo = new PersonRepo(client);
      const sessionRepo = new SessionRepo(client);

      const person = await personRepo.findActorByInstitutionalEmail(expectedEmail);
      if (!person || !person.is_demo) {
        throw new AppError(503, "DEMO_NOT_PROVISIONED", "Demo account is not provisioned.");
      }

      await personRepo.incrementAppLoginCount(person.id);

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const createdAtMs = Date.now();
      const sessionExpiresAt = newSessionExpiresAt(createdAtMs);
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
          joiningYear: person.joining_year,
          isDemo: true
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

  async loginWithInviteCode(input: InviteCodeLoginInput): Promise<VerifyAuthResult> {
    if (!env.BETA_INVITE_AUTH_ENABLED) {
      throw new AppError(403, "AUTH_INVITE_DISABLED", "Invite-code login is disabled.");
    }
    if (!env.BETA_SHARED_INVITE_CODE_HASH) {
      throw new AppError(503, "AUTH_INVITE_MISCONFIGURED", "Invite-code auth is not configured.");
    }

    const institutionalEmail = normalizeEmail(input.institutionalEmail);
    if (!isInstitutionalEmailAllowed(institutionalEmail, this.allowedDomains)) {
      throw new AppError(400, "AUTH_DOMAIN_NOT_ALLOWED", "Use an IIT BHU institutional email address.");
    }

    // Beta / admin DB allowlist for invite login — temporarily disabled so any allowed-domain
    // institute email + valid shared invite code can sign in. Re-enable when cohort gating returns.
    // if (env.BETA_REQUIRE_ALLOWLIST) {
    //   const [betaAllowed, adminAllowed] = await Promise.all([
    //     this.betaAllowedEmailRepo.isAllowed(institutionalEmail),
    //     this.adminAllowedEmailRepo.isAllowed(institutionalEmail)
    //   ]);
    //   const allowed = betaAllowed || adminAllowed;
    //   if (!allowed) {
    //     throw new AppError(403, "AUTH_BETA_NOT_ALLOWED", "Your email is not yet approved for this beta.");
    //   }
    // }

    const submittedHash = hashSecret(input.inviteCode, env.AUTH_SECRET_PEPPER);
    if (submittedHash !== env.BETA_SHARED_INVITE_CODE_HASH) {
      throw new AppError(401, "AUTH_INVALID_INVITE_CODE", "Invalid invite code.");
    }

    const client = await this.pool.connect();
    let shouldRollback = true;
    try {
      await client.query("BEGIN");
      const personRepo = new PersonRepo(client);
      const sessionRepo = new SessionRepo(client);

      const parsedIdentity = parseInstitutionalIdentity(institutionalEmail);
      const person = await personRepo.upsertByInstitutionalEmail({
        institutionalEmail: parsedIdentity.normalizedEmail,
        departmentCode: parsedIdentity.departmentCode,
        departmentName: parsedIdentity.departmentName,
        joiningYear: parsedIdentity.joiningYear,
        isTestUser: isTestInstitutionalEmail(parsedIdentity.normalizedEmail)
      });
      person.role = await this.maybePromoteToAdminByAllowlist(
        personRepo,
        person.id,
        parsedIdentity.normalizedEmail,
        person.role
      );

      await personRepo.incrementAppLoginCount(person.id);

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const createdAtMs = Date.now();
      const sessionExpiresAt = newSessionExpiresAt(createdAtMs);
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
        joiningYear: parsedIdentity.joiningYear,
        isTestUser: isTestInstitutionalEmail(parsedIdentity.normalizedEmail)
      });
      person.role = await this.maybePromoteToAdminByAllowlist(
        personRepo,
        person.id,
        parsedIdentity.normalizedEmail,
        person.role
      );

      await personRepo.incrementAppLoginCount(person.id);

      const sessionToken = generateOpaqueToken(48);
      const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
      const createdAtMs = Date.now();
      const sessionExpiresAt = newSessionExpiresAt(createdAtMs);
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
    const row = await this.sessionRepo.findActiveByHash(sessionHash, env.SESSION_HARD_CAP_HOURS);
    if (!row) {
      return null;
    }
    const isDemo = Boolean(row.is_demo);
    if (isDemo && !env.DEMO_AUTH_ENABLED) {
      // Kill switch: reject existing demo sessions immediately when demo auth is disabled
      return null;
    }
    await this.sessionRepo.touchSlidingThrottled({
      sessionId: row.id,
      throttleSeconds: env.SESSION_TOUCH_MIN_INTERVAL_SECONDS,
      slidingHours: env.SESSION_SLIDING_HOURS,
      hardCapHours: env.SESSION_HARD_CAP_HOURS
    });
    return {
      personId: row.person_id,
      institutionalEmail: row.institutional_email,
      role: isDemo ? "alumni" : row.role,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      joiningYear: row.joining_year,
      isDemo
    };
  }

  async getActorByInstitutionalEmail(email: string): Promise<SessionActor | null> {
    const personRepo = new PersonRepo(this.pool);
    const row = await personRepo.findActorByInstitutionalEmail(normalizeEmail(email));
    if (!row) {
      return null;
    }
    const isDemo = Boolean(row.is_demo);
    return {
      personId: row.id,
      institutionalEmail: row.institutional_email,
      role: isDemo ? "alumni" : row.role,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      joiningYear: row.joining_year,
      isDemo
    };
  }

  async logout(sessionToken: string): Promise<void> {
    const sessionHash = hashSecret(sessionToken, env.AUTH_SECRET_PEPPER);
    await this.sessionRepo.revokeByHash(sessionHash);
  }
}
