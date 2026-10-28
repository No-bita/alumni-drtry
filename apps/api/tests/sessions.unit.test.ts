import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import type { FastifyRequest } from "fastify";
import { env } from "../src/config/env.js";
import { setSessionCookie } from "../src/lib/sessionCookie.js";
import { verifyCsrfOrigin } from "../src/lib/csrfProtection.js";

const original = { node: env.NODE_ENV, cap: env.SESSION_HARD_CAP_HOURS };
afterEach(() => { env.NODE_ENV = original.node; env.SESSION_HARD_CAP_HOURS = original.cap; });

describe("session production boundaries without an external database", () => {
  it("sends Secure, HttpOnly and SameSite=None on the production session cookie", async () => {
    env.NODE_ENV = "production";
    const app = Fastify();
    await app.register(cookie);
    app.get("/cookie", async (_request, reply) => { setSessionCookie(reply, "synthetic-test-token"); return reply.send({ ok: true }); });
    try {
      const response = await app.inject({ method: "GET", url: "/cookie" });
      const header = String(response.headers["set-cookie"]);
      expect(header).toContain("Max-Age=2592000");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=None");
      expect(header).toContain("Path=/");
    } finally { await app.close(); }
  });

  it("uses a configured hard cap in the actual emitted cookie", async () => {
    env.SESSION_HARD_CAP_HOURS = 2;
    const app = Fastify();
    await app.register(cookie);
    app.get("/cookie", async (_request, reply) => { setSessionCookie(reply, "synthetic-test-token"); return reply.send({ ok: true }); });
    try { expect(String((await app.inject({ method: "GET", url: "/cookie" })).headers["set-cookie"])).toContain("Max-Age=7200"); }
    finally { await app.close(); }
  });

  it("rejects logout-all without Origin or Referer in production", () => {
    env.NODE_ENV = "production";
    const request = { method: "POST", url: "/v1/auth/logout-all", routeOptions: { url: "/v1/auth/logout-all" }, cookies: { [env.SESSION_COOKIE_NAME]: "synthetic-token" }, headers: {} } as unknown as FastifyRequest;
    expect(() => verifyCsrfOrigin(request)).toThrow("Missing Origin or Referer header.");
  });
});
