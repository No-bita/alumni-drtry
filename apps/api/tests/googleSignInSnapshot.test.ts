import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/googleOAuth.js", () => ({
  exchangeGoogleAuthorizationCode: vi.fn().mockResolvedValue("GOOGLE_ACCESS_TOKEN"),
  fetchGoogleUserInfo: vi.fn().mockResolvedValue({
    sub: "google-sub-123",
    email: "Aarav.Mehta@iiml.ac.in",
    email_verified: true,
    name: "Aarav Mehta",
    given_name: "Aarav",
    family_name: "Mehta",
    picture: "https://lh3.googleusercontent.com/a/photo",
    locale: "en",
    hd: "iiml.ac.in",
    unexpected_future_claim: "should-not-be-retained"
  })
}));

import { env } from "../src/config/env.js";
import { AuthService } from "../src/services/authService.js";

describe("Google sign-in latest profile", () => {
  let capturedInsert: { sql: string; params: unknown[] } | null;
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let mockPool: { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    (env as any).GOOGLE_CLIENT_ID = (env as any).GOOGLE_CLIENT_ID || "test-client-id";
    (env as any).GOOGLE_CLIENT_SECRET = (env as any).GOOGLE_CLIENT_SECRET || "test-client-secret";
    capturedInsert = null;
    mockClient = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes("INSERT INTO people")) {
          return {
            rows: [
              {
                id: "person-1",
                institutional_email: "aarav.mehta@iiml.ac.in",
                department_code: null,
                department_name: null,
                joining_year: null,
                role: "alumni"
              }
            ],
            rowCount: 1
          };
        }
        if (sql.includes("app_login_count")) {
          return { rows: [{ app_login_count: 1 }], rowCount: 1 };
        }
        if (sql.includes("google_signin_profiles")) {
          capturedInsert = { sql, params };
          return { rows: [{ id: "snap-1" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      // Admin allowlist check (not on the transaction client): nobody is allowed.
      query: vi.fn(async () => ({ rows: [], rowCount: 0 }))
    };
  });

  it("stores only the known Google profile claims, latest per member, and no tokens or codes", async () => {
    const service = new AuthService(mockPool as any, {} as any);
    (service as any).allowedDomains = new Set(["iiml.ac.in"]);
    const result = await service.signInWithGoogle({
      code: "AUTH_CODE",
      redirectUri: "https://app.example/auth/callback",
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent"
    });
    expect(result.person.id).toBe("person-1");

    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert!.params[0]).toBe("person-1");
    // Latest-only semantics: one row per member, replaced on each Google sign-in.
    expect(capturedInsert!.sql).toContain("ON CONFLICT (person_id)");
    const payload = JSON.parse(capturedInsert!.params[1] as string) as Record<string, unknown>;
    expect(payload).toEqual({
      sub: "google-sub-123",
      email: "Aarav.Mehta@iiml.ac.in",
      email_verified: true,
      name: "Aarav Mehta",
      given_name: "Aarav",
      family_name: "Mehta",
      picture: "https://lh3.googleusercontent.com/a/photo",
      locale: "en"
    });
    // The authorization code and the exchanged access token must never be persisted.
    const raw = capturedInsert!.params[1] as string;
    expect(raw).not.toContain("AUTH_CODE");
    expect(raw).not.toContain("GOOGLE_ACCESS_TOKEN");
    expect(raw).not.toContain("should-not-be-retained");
  });

  it("logs only the names of unretained claims, never their values", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const service = new AuthService(mockPool as any, {} as any);
      (service as any).allowedDomains = new Set(["iiml.ac.in"]);
      await service.signInWithGoogle({
        code: "AUTH_CODE",
        redirectUri: "https://app.example/auth/callback",
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      });
      expect(infoSpy).toHaveBeenCalledTimes(1);
      const [message, meta] = infoSpy.mock.calls[0] as [string, { unknownClaims: string[] }];
      expect(message).toContain("do not retain");
      expect(meta.unknownClaims).toEqual(["hd", "unexpected_future_claim"]);
      const logged = JSON.stringify(infoSpy.mock.calls[0]);
      expect(logged).not.toContain("should-not-be-retained");
      expect(logged).not.toContain("Aarav");
      expect(logged).not.toContain("GOOGLE_ACCESS_TOKEN");
      expect(logged).not.toContain("AUTH_CODE");
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("lets sign-in succeed when the profile save fails", async () => {
    mockClient.query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("google_signin_profiles")) {
        throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      }
      if (sql.includes("INSERT INTO people")) {
        return {
          rows: [
            {
              id: "person-1",
              institutional_email: "aarav.mehta@iiml.ac.in",
              department_code: null,
              department_name: null,
              joining_year: null,
              role: "alumni"
            }
          ],
          rowCount: 1
        };
      }
      if (sql.includes("app_login_count")) {
        return { rows: [{ app_login_count: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const service = new AuthService(mockPool as any, {} as any);
      (service as any).allowedDomains = new Set(["iiml.ac.in"]);
      const result = await service.signInWithGoogle({
        code: "AUTH_CODE",
        redirectUri: "https://app.example/auth/callback",
        ipAddress: "127.0.0.1",
        userAgent: "TestAgent"
      });
      expect(result.person.id).toBe("person-1");
      expect(result.sessionToken).toBeTruthy();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      // Safe logging: no personal claims, tokens or query values in the log line.
      const logged = JSON.stringify(errorSpy.mock.calls[0]);
      expect(logged).not.toContain("Aarav");
      expect(logged).not.toContain("GOOGLE_ACCESS_TOKEN");
      expect(logged).not.toContain("AUTH_CODE");
      // The sign-in transaction itself committed before the best-effort save ran.
      const calls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as string
      );
      expect(calls.indexOf("COMMIT")).toBeGreaterThan(-1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
