import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { assertSameSiteAuthRequest } from "../src/lib/csrfProtection.js";
import { pathOnly, resolveTrustProxy, trustHops } from "../src/lib/requestHardening.js";
import { scrubEvent } from "../src/lib/sentry.js";
import { LINK_TTL_MS, signLinkToken, verifyLinkToken } from "../src/whatsapp/linkToken.js";
import { testEmailCapture } from "../src/services/emailSender.js";
import { SESSION_COOKIE, loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
const here = path.dirname(fileURLToPath(import.meta.url));

describe("security hardening (local test database only)", () => {
  let db: Pool;
  let app: App;
  let a: Who;
  let b: Who;
  let admin: Who;

  const get = (on: App, url: string, who?: Who, headers: Record<string, string> = {}) =>
    on.inject({ method: "GET", url, headers: { ...(who ? { cookie: who.cookie } : {}), ...headers } });

  beforeAll(async () => {
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    app = await createApp();
    a = await loginForTest(app, `sec-a-${run}@iitbhu.ac.in`);
    b = await loginForTest(app, `sec-b-${run}@iitbhu.ac.in`);
    admin = await loginForTest(app, `sec-admin-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    await db.query(`UPDATE people SET full_name = 'Sec ' || id::text, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = ANY($1::uuid[])`, [
      [a.personId, b.personId, admin.personId]
    ]);
  });

  afterAll(async () => {
    await db?.query(`DELETE FROM discovery_read_counters WHERE person_id = ANY($1::uuid[])`, [[a?.personId, b?.personId, admin?.personId]]);
    await db?.end();
    await app?.close();
  });

  /* ---------------- Database lock ---------------- */

  it("every table in public has row-level security on (new migrations must keep it that way)", async () => {
    const r = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity ORDER BY 1`
    );
    expect(r.rows.map((x) => x.relname), "tables without row-level security; add them to a migration").toEqual([]);
  });

  it("the lock never applies to the owner: the app keeps reading and writing", async () => {
    const r = await db.query<{ forced: number }>(
      `SELECT count(*) FILTER (WHERE c.relforcerowsecurity)::int AS forced FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`
    );
    expect(r.rows[0]!.forced).toBe(0);
    expect((await get(app, "/v1/me", a)).statusCode).toBe(200);
  });

  it("the migration stops (changes nothing) when run by a role that doesn't own the tables", async () => {
    const sql = readFileSync(path.join(here, "../src/db/migrations/058_row_level_security.sql"), "utf8");
    const role = `rls_nonowner_${run}`;
    const client = await db.connect();
    try {
      await client.query(`CREATE ROLE ${role} NOLOGIN`);
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${role}`);
      await expect(client.query(sql)).rejects.toThrow(/Row-level security not enabled: role "rls_nonowner_\d+" neither owns table/);
      await client.query("ROLLBACK");
    } finally {
      await client.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
      client.release();
    }
  });

  it("a role with no grants sees nothing even when granted SELECT (no policies = no rows)", async () => {
    const role = `rls_reader_${run}`;
    const client = await db.connect();
    try {
      await client.query(`CREATE ROLE ${role} NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await client.query(`GRANT SELECT ON people TO ${role}`);
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${role}`);
      const r = await client.query(`SELECT count(*)::int AS n FROM people`);
      expect(r.rows[0].n).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      await client.query(`REVOKE ALL ON people FROM ${role}`).catch(() => undefined);
      await client.query(`REVOKE USAGE ON SCHEMA public FROM ${role}`).catch(() => undefined);
      await client.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
      client.release();
    }
  });

  /* ---------------- Anti-scraping ---------------- */

  it("page sizes are capped: directory search 20, Wall feed 48 (larger requests are clamped)", async () => {
    const s = await get(app, "/v1/search?limit=100", a);
    expect(s.statusCode, s.body).toBe(200);
    expect((s.json() as { results: unknown[] }).results.length).toBeLessThanOrEqual(20);
    const f = await get(app, "/v1/intentcasts?limit=100", a);
    expect(f.statusCode, f.body).toBe(200);
    expect((f.json() as { intentcasts: unknown[] }).intentcasts.length).toBeLessThanOrEqual(48);
  });

  it("daily cap: counted in the database, shared by every API instance; 429 with a friendly message", async () => {
    const one = await createApp({ discoveryLimits: { perDay: 3, perMinute: 0, perIpPerMinute: 0 } });
    const two = await createApp({ discoveryLimits: { perDay: 3, perMinute: 0, perIpPerMinute: 0 } });
    try {
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = $1`, [b.personId]);
      expect((await get(one, "/v1/search", b)).statusCode).toBe(200);
      expect((await get(two, `/v1/profiles/${a.personId}`, b)).statusCode).toBe(200);
      expect((await get(one, "/v1/intentcasts", b)).statusCode).toBe(200);
      const over = await get(two, "/v1/search", b);
      expect(over.statusCode).toBe(429);
      expect(over.json()).toEqual({
        code: "DISCOVERY_DAILY_LIMIT",
        message: "You've looked at a lot of profiles today. Try again tomorrow."
      });
      expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
      // A restart doesn't reset it: a fresh instance still refuses.
      const three = await createApp({ discoveryLimits: { perDay: 3, perMinute: 0, perIpPerMinute: 0 } });
      expect((await get(three, "/v1/search", b)).statusCode).toBe(429);
      await three.close();
      const row = await db.query<{ count: number }>(
        `SELECT count FROM discovery_read_counters WHERE person_id = $1 AND bucket = 'day'`,
        [b.personId]
      );
      expect(row.rows[0]!.count).toBeGreaterThanOrEqual(4);
    } finally {
      await one.close();
      await two.close();
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = $1`, [b.personId]);
    }
  });

  it("admins are not counted", async () => {
    const strict = await createApp({ discoveryLimits: { perDay: 1, perMinute: 1, perIpPerMinute: 0 } });
    try {
      for (let i = 0; i < 4; i += 1) expect((await get(strict, "/v1/search", admin)).statusCode).toBe(200);
      const rows = await db.query(`SELECT 1 FROM discovery_read_counters WHERE person_id = $1`, [admin.personId]);
      expect(rows.rowCount).toBe(0);
    } finally {
      await strict.close();
    }
  });

  it("burst limit per minute, also in the database", async () => {
    // Stay clear of a minute boundary so the three requests share one minute.
    const s = new Date().getUTCSeconds();
    if (s > 50) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
    const burst = await createApp({ discoveryLimits: { perDay: 0, perMinute: 2, perIpPerMinute: 0 } });
    try {
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = $1`, [a.personId]);
      expect((await get(burst, "/v1/search", a)).statusCode).toBe(200);
      expect((await get(burst, "/v1/search", a)).statusCode).toBe(200);
      const over = await get(burst, "/v1/search", a);
      expect(over.statusCode).toBe(429);
      expect(over.json()).toMatchObject({ code: "DISCOVERY_RATE_LIMITED" });
      expect(Number(over.headers["retry-after"])).toBeLessThanOrEqual(60);
    } finally {
      await burst.close();
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = $1`, [a.personId]);
    }
  });

  it("admin page: members near today's limit, counted only", async () => {
    const watch = await createApp({ discoveryLimits: { perDay: 5, perMinute: 0, perIpPerMinute: 0 } });
    try {
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = ANY($1::uuid[])`, [[a.personId, b.personId]]);
      for (let i = 0; i < 4; i += 1) await get(watch, "/v1/search", a); // 4 of 5 = 80%
      for (let i = 0; i < 6; i += 1) await get(watch, "/v1/search", b); // over the cap
      const before = (await get(watch, "/v1/admin/metrics/discovery-limits", admin)).json() as {
        limits: { cap: number; nearLimit: number; atLimit: number; day: string };
      };
      expect(before.limits.cap).toBe(5);
      expect(before.limits.nearLimit).toBeGreaterThanOrEqual(2);
      expect(before.limits.atLimit).toBeGreaterThanOrEqual(1);
      expect(Object.keys(before.limits).sort()).toEqual(["atLimit", "cap", "day", "nearLimit"]);
      expect((await get(watch, "/v1/admin/metrics/discovery-limits", a)).statusCode).toBe(403);
    } finally {
      await watch.close();
      await db.query(`DELETE FROM discovery_read_counters WHERE person_id = ANY($1::uuid[])`, [[a.personId, b.personId]]);
    }
  });

  /* ---------------- Proxy, logs, sign-in ---------------- */

  it("trust proxy: the real client IP behind two proxies; unset means none outside production", async () => {
    const server = Fastify({ trustProxy: trustHops(2) });
    server.get("/ip", async (request) => ({ ip: request.ip }));
    const r = await server.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "10.0.0.2",
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }
    });
    expect(r.json()).toEqual({ ip: "203.0.113.9" });
    await server.close();
    expect(resolveTrustProxy(undefined, "test")).toBe(false);
    expect(typeof resolveTrustProxy(undefined, "production")).toBe("function");
    expect(resolveTrustProxy("false", "production")).toBe(false);
    expect(resolveTrustProxy("10.0.0.0/8, 172.16.0.0/12", "production")).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);
  });

  it("request logs carry the path only: no magic-link token, search terms or cookies", async () => {
    const lines: string[] = [];
    const logged = await createApp({ logStream: { write: (line: string) => void lines.push(line) } });
    try {
      await logged.inject({
        method: "GET",
        url: `/v1/auth/verify?challengeId=00000000-0000-0000-0000-000000000000&magicLinkToken=SECRETTOKEN${run}abcdef`
      });
      await logged.inject({ method: "GET", url: `/v1/search?q=private-name-${run}`, headers: { cookie: a.cookie } });
      const all = lines.join("\n");
      expect(all).toContain("/v1/auth/verify");
      expect(all).toContain("/v1/search");
      expect(all).not.toContain(`SECRETTOKEN${run}`);
      expect(all).not.toContain(`private-name-${run}`);
      expect(all).not.toContain(a.cookie.split("=")[1]!);
    } finally {
      await logged.close();
    }
    expect(pathOnly("/v1/x?token=1")).toBe("/v1/x");
  });

  it("magic link: POST with the token in the body signs in; the old GET link still works", async () => {
    const email = `sec-post-${run}@iitbhu.ac.in`;
    await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: email } });
    const link = new URL(testEmailCapture.lastAuthEmail(email)!.magicLinkUrl);
    const post = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: { challengeId: link.searchParams.get("challengeId"), magicLinkToken: link.searchParams.get("magicLinkToken") }
    });
    expect(post.statusCode, post.body).toBe(200);
    expect(String(post.headers["set-cookie"])).toContain(`${SESSION_COOKIE}=`);
    // GET (pages loaded before this change) keeps working: loginForTest uses it.
    const viaGet = await loginForTest(app, `sec-get-${run}@iitbhu.ac.in`);
    expect(viaGet.personId).toBeTruthy();
  });

  it("sign-in from another site is refused (login CSRF); our own pages pass", async () => {
    const req = (headers: Record<string, string>) => ({ headers }) as unknown as Parameters<typeof assertSameSiteAuthRequest>[0];
    expect(() => assertSameSiteAuthRequest(req({ origin: "https://evil.example" }), "test")).toThrow(
      expect.objectContaining({ code: "CSRF_FORBIDDEN" })
    );
    expect(() => assertSameSiteAuthRequest(req({ "sec-fetch-site": "cross-site" }), "test")).toThrow();
    expect(() => assertSameSiteAuthRequest(req({}), "production")).toThrow();
    expect(() => assertSameSiteAuthRequest(req({ "sec-fetch-site": "same-origin" }), "production")).not.toThrow();
    expect(() => assertSameSiteAuthRequest(req({ referer: "http://localhost:4000/auth/verify?x=1" }), "production")).not.toThrow();
    const r = await app.inject({
      method: "GET",
      url: "/v1/auth/verify?challengeId=00000000-0000-0000-0000-000000000000&magicLinkToken=abcdefabcdefabcdef",
      headers: { referer: "https://evil.example/page" }
    });
    expect(r.statusCode).toBe(403);
  });

  it("security headers on API responses", async () => {
    for (const r of [await app.inject({ method: "GET", url: "/healthz" }), await get(app, "/v1/me")]) {
      expect(r.headers["x-content-type-options"]).toBe("nosniff");
      expect(r.headers["x-frame-options"]).toBe("DENY");
      expect(r.headers["referrer-policy"]).toBe("no-referrer");
      expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
    }
  });

  it("Sentry events lose query strings, cookies, headers, bodies and user details", () => {
    const e = scrubEvent({
      request: {
        url: "https://api/v1/auth/verify?magicLinkToken=abc",
        query_string: "magicLinkToken=abc",
        cookies: { alumni_session: "x" },
        headers: { cookie: "x" },
        data: { email: "a@b" }
      },
      user: { id: "p1", email: "a@b", ip_address: "1.2.3.4" },
      extra: { url: "/v1/search?q=name" }
    });
    expect(e.request).toEqual({ url: "https://api/v1/auth/verify" });
    expect(e.user).toEqual({ id: "p1" });
    expect(e.extra).toEqual({ url: "/v1/search" });
  });

  /* ---------------- Wall, WhatsApp ---------------- */

  it("Wall: suspended authors and other people's removed posts never appear, whatever the client asks", async () => {
    const post = (await db.query<{ id: string }>(
      `INSERT INTO intentcasts (author_person_id, content, category, editable_until) VALUES ($1, $2, 'mentorship', now()) RETURNING id`,
      [b.personId, `Sec wall ${run}`]
    )).rows[0]!.id;
    const removed = (await db.query<{ id: string }>(
      `INSERT INTO intentcasts (author_person_id, content, category, editable_until, author_soft_deleted_at)
       VALUES ($1, $2, 'mentorship', now(), now()) RETURNING id`,
      [b.personId, `Sec removed ${run}`]
    )).rows[0]!.id;
    try {
      const ids = async () =>
        ((await get(app, "/v1/intentcasts?limit=48&excludeAuthorSoftDeleted=false", a)).json() as { intentcasts: Array<{ id: string }> }).intentcasts.map(
          (x) => x.id
        );
      let seen = await ids();
      expect(seen).toContain(post);
      expect(seen).not.toContain(removed);
      await db.query(`UPDATE people SET suspended_at = now() WHERE id = $1`, [b.personId]);
      seen = await ids();
      expect(seen).not.toContain(post);
    } finally {
      await db.query(`UPDATE people SET suspended_at = NULL WHERE id = $1`, [b.personId]);
      await db.query(`DELETE FROM intentcasts WHERE id = ANY($1::uuid[])`, [[post, removed]]);
    }
  });

  it("WhatsApp website links last two hours by default", () => {
    expect(LINK_TTL_MS).toBe(120 * 60 * 1000);
    const now = Date.now();
    const token = signLinkToken("919999999999", now);
    expect(verifyLinkToken(token, now + 119 * 60 * 1000)?.waId).toBe("919999999999");
    expect(verifyLinkToken(token, now + 121 * 60 * 1000)).toBeNull();
  });
});
