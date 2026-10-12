import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { env } from "../src/config/env.js";
import {
  setSessionCookie,
  clearSessionCookie,
  setOAuthStateCookie,
  getSessionCookieOptions,
  sessionSameSite,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_MAX_AGE_SEC
} from "../src/lib/sessionCookie.js";
import { verifyCsrfOrigin, parseOrigin, getAllowedOrigins } from "../src/lib/csrfProtection.js";
import { AppError, isAppError } from "../src/lib/errors.js";

describe("Session cookie helper", () => {
  it("generates correct session cookie options in test/dev", () => {
    const opts = getSessionCookieOptions();
    expect(opts.path).toBe("/");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.secure).toBe(false);
    expect(opts.maxAge).toBe(env.SESSION_HARD_CAP_HOURS * 3600);
  });

  it("sets session cookie via setSessionCookie helper", () => {
    const replyMock: any = {
      setCookie: vi.fn(),
    };
    setSessionCookie(replyMock, "token-12345");
    expect(replyMock.setCookie).toHaveBeenCalledWith(
      env.SESSION_COOKIE_NAME,
      "token-12345",
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: env.SESSION_HARD_CAP_HOURS * 3600,
      })
    );
  });

  it("clears session cookie via clearSessionCookie helper", () => {
    const replyMock: any = {
      clearCookie: vi.fn(),
    };
    clearSessionCookie(replyMock);
    expect(replyMock.clearCookie).toHaveBeenCalledWith(
      env.SESSION_COOKIE_NAME,
      expect.objectContaining({
        path: "/",
      })
    );
  });

  it("sets OAuth state cookie via setOAuthStateCookie helper", () => {
    const replyMock: any = {
      setCookie: vi.fn(),
    };
    setOAuthStateCookie(replyMock, "state-abcde");
    expect(replyMock.setCookie).toHaveBeenCalledWith(
      GOOGLE_STATE_COOKIE,
      "state-abcde",
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: GOOGLE_STATE_MAX_AGE_SEC,
      })
    );
  });
});

describe("CSRF Origin / Referer check hook", () => {
  let app: ReturnType<typeof Fastify>;
  const allowedOrigin = "https://alumni.iitbhu.ac.in";
  const untrustedOrigin = "https://evil-attacker.com";

  beforeEach(async () => {
    (env as any).CORS_ORIGIN = allowedOrigin;
    (env as any).NODE_ENV = "test";

    app = Fastify();
    await app.register(cookie);

    app.setErrorHandler((error, _request, reply) => {
      if (isAppError(error)) {
        return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      }
      return reply.code(500).send({ message: "Internal error" });
    });

    app.addHook("preHandler", async (request, _reply) => {
      verifyCsrfOrigin(request);
    });

    // Dummy routes
    app.post("/v1/auth/start", async (_req, reply) => reply.code(200).send({ ok: true }));
    app.post("/v1/auth/verify", async (_req, reply) => reply.code(200).send({ ok: true }));
    app.post("/v1/auth/logout", async (_req, reply) => reply.code(204).send());
    app.post("/v1/items", async (_req, reply) => reply.code(200).send({ created: true }));
    app.put("/v1/items/1", async (_req, reply) => reply.code(200).send({ updated: true }));
    app.patch("/v1/items/1", async (_req, reply) => reply.code(200).send({ patched: true }));
    app.delete("/v1/items/1", async (_req, reply) => reply.code(200).send({ deleted: true }));
    app.get("/v1/items", async (_req, reply) => reply.code(200).send({ items: [] }));
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects cross-origin POST carrying session cookie with 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: untrustedOrigin,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("CSRF_FORBIDDEN");
  });

  it("rejects cross-origin PATCH, PUT, and DELETE carrying session cookie with 403", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const res = await app.inject({
        method,
        url: "/v1/items/1",
        headers: {
          cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
          origin: untrustedOrigin,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("CSRF_FORBIDDEN");
    }
  });

  it("rejects untrusted Referer header carrying session cookie with 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        referer: `${untrustedOrigin}/phishing-page`,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_FORBIDDEN");
  });

  it("rejects untrusted origin even when CORS_ORIGIN is '*' for cookie requests", async () => {
    (env as any).CORS_ORIGIN = "*";

    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: untrustedOrigin,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_FORBIDDEN");
  });

  it("allows same-origin POST carrying session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: allowedOrigin,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: true });
  });

  it("allows allowed origin from Referer header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        referer: `${allowedOrigin}/dashboard`,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ created: true });
  });

  it("allows non-state-changing GET requests even with cross-origin headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: untrustedOrigin,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  it("allows requests without session cookie (no-cookie auth start)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      headers: {
        origin: untrustedOrigin,
      },
      payload: { institutionalEmail: "user@iitbhu.ac.in" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("exempts unauthenticated auth-start and auth-verify endpoints even if stale cookie is present", async () => {
    const resStart = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=stale-cookie`,
        origin: untrustedOrigin,
      },
      payload: { institutionalEmail: "user@iitbhu.ac.in" },
    });
    expect(resStart.statusCode).toBe(200);

    const resVerify = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=stale-cookie`,
        origin: untrustedOrigin,
      },
      payload: { challengeId: "123" },
    });
    expect(resVerify.statusCode).toBe(200);
  });

  it("protects auth logout against cross-origin CSRF with session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: untrustedOrigin,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_FORBIDDEN");
  });

  it("allows auth logout from same-origin with session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
        origin: allowedOrigin,
      },
    });

    expect(res.statusCode).toBe(204);
  });

  it("fails closed in production when Origin and Referer are missing on state-changing request with cookie", async () => {
    (env as any).NODE_ENV = "production";

    const res = await app.inject({
      method: "POST",
      url: "/v1/items",
      headers: {
        cookie: `${env.SESSION_COOKIE_NAME}=valid-session-token`,
      },
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_FORBIDDEN");
  });
});
