import type { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";
import { generateOpaqueToken, hashSecret } from "../lib/crypto.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import { AppError } from "../lib/errors.js";
import { cappedRole, parseViewAsAllowlist } from "../lib/viewAs.js";
import { ViewAsRepo, type ViewAsSessionRow } from "../repos/viewAsRepo.js";
import type { SessionActor } from "./authService.js";

/** What the web app is told about an active view-as session (GET /v1/me, start). */
export interface ViewAsInfo {
  sessionId: string;
  adminPersonId: string;
  targetPersonId: string;
  targetName: string | null;
  targetEmail: string;
  expiresAt: string;
  readOnly: true;
}

export interface ViewAsPersonResult {
  personId: string;
  fullName: string | null;
  institutionalEmail: string;
  batchYear: number | null;
  departmentCode: string | null;
  role: "alumni" | "admin" | "super_admin";
  suspended: boolean;
}

export interface ViewAsOptions {
  /** Comma-separated admin sign-in emails (VIEW_AS_ADMIN_EMAILS). Empty = off. */
  adminEmails: string;
  ttlMinutes: number;
}

const SEARCH_LIMIT = 20;

function isAdminRole(role: SessionActor["role"]): boolean {
  return role === "admin" || role === "super_admin";
}

export class ViewAsService {
  private readonly allowlist: ReadonlySet<string>;
  private readonly ttlMinutes: number;
  private readonly repo: ViewAsRepo;

  constructor(
    private readonly pool: Pool,
    options: ViewAsOptions
  ) {
    this.allowlist = parseViewAsAllowlist(options.adminEmails);
    this.ttlMinutes = options.ttlMinutes;
    this.repo = new ViewAsRepo(pool);
  }

  get sessionTtlMinutes(): number {
    return this.ttlMinutes;
  }

  get enabled(): boolean {
    return this.allowlist.size > 0;
  }

  /** Admin by the normal role check AND on the explicit allowlist. Checked again on every request. */
  canUse(actor: Pick<SessionActor, "role" | "institutionalEmail" | "isDemo"> | null | undefined): boolean {
    if (!actor || actor.isDemo || !isAdminRole(actor.role)) return false;
    return this.allowlist.has(normalizeEmail(actor.institutionalEmail));
  }

  assertCanUse(actor: SessionActor): void {
    if (!isAdminRole(actor.role)) {
      throw new AppError(403, "AUTH_FORBIDDEN", "Admin access required.");
    }
    if (!this.canUse(actor)) {
      throw new AppError(403, "VIEW_AS_FORBIDDEN", "View as member isn't enabled for your account.");
    }
  }

  private hash(token: string): string {
    return hashSecret(token, env.AUTH_SECRET_PEPPER);
  }

  private async inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchPeople(q: string, admin: SessionActor): Promise<ViewAsPersonResult[]> {
    this.assertCanUse(admin);
    const rows = await this.repo.searchPeople(q, admin.personId, SEARCH_LIMIT);
    return rows.map((r) => ({
      personId: r.id,
      fullName: r.full_name,
      institutionalEmail: r.institutional_email,
      batchYear: r.batch_year,
      departmentCode: r.department_code,
      role: r.role,
      suspended: r.suspended_at !== null
    }));
  }

  async start(input: {
    admin: SessionActor;
    targetPersonId: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<{ token: string; info: ViewAsInfo }> {
    return this.switchTo({ ...input, currentToken: null });
  }

  /**
   * Start viewing as a member, first ending the admin's current view-as session (if `currentToken` is
   * theirs and still open). Both happen in one transaction, each with its audit row, so the admin is
   * never left on two sessions or on none half way.
   */
  async switchTo(input: {
    admin: SessionActor;
    currentToken: string | null;
    targetPersonId: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<{ token: string; info: ViewAsInfo; endedSessionId: string | null }> {
    this.assertCanUse(input.admin);
    if (input.targetPersonId === input.admin.personId) {
      throw new AppError(400, "VIEW_AS_SELF", "You can't view as yourself. Use Exit to go back to your own account.");
    }
    const target = await this.repo.findTarget(input.targetPersonId);
    if (!target) {
      throw new AppError(404, "VIEW_AS_TARGET_NOT_FOUND", "Member not found.");
    }
    const token = generateOpaqueToken(32);
    const { session, endedSessionId } = await this.inTransaction(async (client) => {
      const repo = new ViewAsRepo(client);
      let endedSessionId: string | null = null;
      if (input.currentToken) {
        const hash = this.hash(input.currentToken);
        const current = await repo.findActiveByHash(hash);
        // Only the admin's own open session is ended; anyone else's token is ignored.
        if (current && current.admin_person_id === input.admin.personId) {
          const ended = await repo.endByHash(hash);
          if (ended) {
            endedSessionId = ended.id;
            await repo.insertAudit({
              sessionId: ended.id,
              event: "end",
              adminPersonId: ended.admin_person_id,
              targetPersonId: ended.target_person_id,
              ip: input.ip,
              userAgent: input.userAgent
            });
          }
        }
      }
      const created = await repo.createSession({
        tokenHash: this.hash(token),
        adminPersonId: input.admin.personId,
        targetPersonId: target.id,
        ttlMinutes: this.ttlMinutes,
        ip: input.ip,
        userAgent: input.userAgent
      });
      await repo.insertAudit({
        sessionId: created.id,
        event: "start",
        adminPersonId: input.admin.personId,
        targetPersonId: target.id,
        ip: input.ip,
        userAgent: input.userAgent
      });
      return { session: created, endedSessionId };
    });
    return {
      token,
      endedSessionId,
      info: {
        sessionId: session.id,
        adminPersonId: session.admin_person_id,
        targetPersonId: target.id,
        targetName: target.full_name,
        targetEmail: target.institutional_email,
        expiresAt: session.expires_at.toISOString(),
        readOnly: true
      }
    };
  }

  /**
   * The member identity to use for this request, or null when the token is unknown, ended or expired,
   * belongs to a different admin, the admin is no longer allowed, or the member is gone.
   */
  async resolve(token: string, real: SessionActor): Promise<{ actor: SessionActor; info: ViewAsInfo } | null> {
    if (!this.canUse(real)) return null;
    const session = await this.repo.findActiveByHash(this.hash(token));
    if (!session || session.admin_person_id !== real.personId) return null;
    const target = await this.repo.findTarget(session.target_person_id);
    if (!target) return null;
    const info: ViewAsInfo = {
      sessionId: session.id,
      adminPersonId: session.admin_person_id,
      targetPersonId: target.id,
      targetName: target.full_name,
      targetEmail: target.institutional_email,
      expiresAt: session.expires_at.toISOString(),
      readOnly: true
    };
    const isDemo = Boolean(target.is_demo);
    return {
      info,
      actor: {
        personId: target.id,
        institutionalEmail: target.institutional_email,
        role: isDemo ? "alumni" : cappedRole(target.role, real.role),
        departmentCode: target.department_code,
        departmentName: target.department_name,
        joiningYear: target.joining_year,
        isDemo,
        viewAs: { sessionId: session.id, adminPersonId: session.admin_person_id }
      }
    };
  }

  /** Ends the session behind this token (if still open) and records it. Null when nothing was open. */
  async end(token: string, ip: string | null, userAgent: string | null): Promise<ViewAsSessionRow | null> {
    return this.inTransaction(async (client) => {
      const repo = new ViewAsRepo(client);
      const ended = await repo.endByHash(this.hash(token));
      if (!ended) return null;
      await repo.insertAudit({
        sessionId: ended.id,
        event: "end",
        adminPersonId: ended.admin_person_id,
        targetPersonId: ended.target_person_id,
        ip,
        userAgent
      });
      return ended;
    });
  }
}
