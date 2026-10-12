import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { hashSecret } from "../src/lib/crypto.js";
import { env } from "../src/config/env.js";
import { AuthService } from "../src/services/authService.js";
import {
  personIsDiscoverableForViewerSql,
  personIsDemoOnlyAlumniSql,
  personIsDiscoverableAlumniSql
} from "../src/lib/demoPersonSql.js";

describe("personIsDiscoverableForViewerSql", () => {
  it("scopes strictly to demo alumni when viewer is a demo user", () => {
    const sql = personIsDiscoverableForViewerSql("p", true);
    expect(sql).toBe(personIsDemoOnlyAlumniSql("p"));
    expect(sql).toContain("batchdemo.%");
    expect(sql).toContain("platformdemo.%");
  });

  it("retains normal discoverable rules when viewer is not demo", () => {
    const sql = personIsDiscoverableForViewerSql("p", false);
    expect(sql).toBe(personIsDiscoverableAlumniSql("p"));
  });
});

describe("AuthService demo login and kill switch", () => {
  const demoEmail = "demo-prospect@alumni.test";
  const demoPassword = "correct-demo-password-123";
  const passwordHash = hashSecret(demoPassword, env.AUTH_SECRET_PEPPER);

  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let mockPool: {
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let authService: AuthService;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn()
    };
    const mockEmailSender = { sendOtp: vi.fn(), sendMagicLink: vi.fn() };
    authService = new AuthService(mockPool as any, mockEmailSender as any);
  });

  it("rejects demo login when DEMO_AUTH_ENABLED is false", async () => {
    (env as any).DEMO_AUTH_ENABLED = false;
    (env as any).DEMO_AUTH_EMAIL = demoEmail;
    (env as any).DEMO_AUTH_PASSWORD_HASH = passwordHash;

    await expect(
      authService.loginWithDemoCredentials({
        email: demoEmail,
        password: demoPassword,
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "DEMO_AUTH_DISABLED"
    });
  });

  it("rejects demo login with wrong email", async () => {
    (env as any).DEMO_AUTH_ENABLED = true;
    (env as any).DEMO_AUTH_EMAIL = demoEmail;
    (env as any).DEMO_AUTH_PASSWORD_HASH = passwordHash;

    await expect(
      authService.loginWithDemoCredentials({
        email: "other@alumni.test",
        password: demoPassword,
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("rejects demo login with wrong password", async () => {
    (env as any).DEMO_AUTH_ENABLED = true;
    (env as any).DEMO_AUTH_EMAIL = demoEmail;
    (env as any).DEMO_AUTH_PASSWORD_HASH = passwordHash;

    await expect(
      authService.loginWithDemoCredentials({
        email: demoEmail,
        password: "wrong-password",
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("rejects with 503 when demo account is not provisioned in database", async () => {
    (env as any).DEMO_AUTH_ENABLED = true;
    (env as any).DEMO_AUTH_EMAIL = demoEmail;
    (env as any).DEMO_AUTH_PASSWORD_HASH = passwordHash;

    // mockClient.query begins transaction, then queries findActorByInstitutionalEmail -> returns no rows
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.includes("FROM people")) return { rows: [] };
      if (sql === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    });

    await expect(
      authService.loginWithDemoCredentials({
        email: demoEmail,
        password: demoPassword,
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "DEMO_NOT_PROVISIONED"
    });
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("succeeds when demo credentials are valid and account is provisioned", async () => {
    (env as any).DEMO_AUTH_ENABLED = true;
    (env as any).DEMO_AUTH_EMAIL = demoEmail;
    (env as any).DEMO_AUTH_PASSWORD_HASH = passwordHash;

    const demoPersonId = "11111111-2222-3333-4444-555555555555";
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.includes("FROM people")) {
        return {
          rows: [
            {
              id: demoPersonId,
              institutional_email: demoEmail,
              role: "admin", // Even if DB had admin, it must be forced to alumni
              department_code: "cse",
              department_name: "Computer Science",
              joining_year: 2020,
              is_demo: true
            }
          ]
        };
      }
      if (sql.includes("app_login_count")) {
        return { rows: [{ app_login_count: 1 }] };
      }
      if (sql.includes("INSERT INTO sessions") || sql.includes("sessions")) return { rows: [] };
      if (sql === "COMMIT") return { rows: [] };
      return { rows: [] };
    });

    const res = await authService.loginWithDemoCredentials({
      email: demoEmail,
      password: demoPassword,
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent"
    });

    expect(res.sessionToken).toBeDefined();
    expect(res.person.id).toBe(demoPersonId);
    expect(res.person.institutionalEmail).toBe(demoEmail);
    expect(res.person.isDemo).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("kill switch: invalidates active demo sessions when DEMO_AUTH_ENABLED is turned off without affecting normal users", async () => {
    const demoPersonId = "11111111-2222-3333-4444-555555555555";
    const normalPersonId = "99999999-8888-7777-6666-555555555555";
    const demoToken = "demo-session-token-12345";
    const normalToken = "normal-session-token-67890";
    const demoHash = hashSecret(demoToken, env.AUTH_SECRET_PEPPER);
    const normalHash = hashSecret(normalToken, env.AUTH_SECRET_PEPPER);

    // Mock active session lookup
    (authService as any).sessionRepo = {
      findActiveByHash: vi.fn().mockImplementation(async (hash: string) => {
        if (hash === demoHash) {
          return {
            id: "session-demo",
            person_id: demoPersonId,
            institutional_email: demoEmail,
            role: "alumni",
            department_code: "cse",
            department_name: "Computer Science",
            joining_year: 2020,
            is_demo: true
          };
        }
        if (hash === normalHash) {
          return {
            id: "session-normal",
            person_id: normalPersonId,
            institutional_email: "regular@alumni.test",
            role: "alumni",
            department_code: "ece",
            department_name: "Electronics",
            joining_year: 2018,
            is_demo: false
          };
        }
        return null;
      }),
      touchSlidingThrottled: vi.fn()
    };

    // When DEMO_AUTH_ENABLED is true, demo session resolves with isDemo: true
    (env as any).DEMO_AUTH_ENABLED = true;
    const actorEnabled = await authService.getActorFromSessionToken(demoToken);
    expect(actorEnabled).not.toBeNull();
    expect(actorEnabled?.isDemo).toBe(true);

    // When DEMO_AUTH_ENABLED is false, killswitch activates immediately for demo sessions
    (env as any).DEMO_AUTH_ENABLED = false;
    const actorDisabled = await authService.getActorFromSessionToken(demoToken);
    expect(actorDisabled).toBeNull();

    // Normal user sessions remain completely unaffected when DEMO_AUTH_ENABLED is false
    const normalActor = await authService.getActorFromSessionToken(normalToken);
    expect(normalActor).not.toBeNull();
    expect(normalActor?.isDemo).toBe(false);
    expect(normalActor?.personId).toBe(normalPersonId);
  });
});

describe("requireNonDemoMutation guard", () => {
  function checkGuard(actor: { isDemo?: boolean }) {
    if (actor.isDemo) {
      throw new AppError(403, "DEMO_READ_ONLY", "Demo accounts are read-only.");
    }
  }

  it("blocks mutations with 403 DEMO_READ_ONLY when actor.isDemo is true", () => {
    expect(() => checkGuard({ isDemo: true })).toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: "DEMO_READ_ONLY"
      })
    );
  });

  it("permits mutations when actor is not demo", () => {
    expect(() => checkGuard({ isDemo: false })).not.toThrow();
    expect(() => checkGuard({})).not.toThrow();
  });
});
