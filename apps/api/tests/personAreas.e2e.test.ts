import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import { SESSION_COOKIE } from "./helpers/login.js";

/**
 * Areas of experience (migration 069) and the removed per-tag lines (070).
 * Requires a disposable test database (DATABASE_URL) with migrations through 070. No emails are sent:
 * members are seeded directly with sessions.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;

describe("Areas of experience (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  type Member = { id: string; cookie: string };
  let n = 0;

  async function member(opts: { complete?: boolean } = {}): Promise<Member> {
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, profile_completed_at) VALUES ($1, $2, ${opts.complete === false ? "NULL" : "now()"}) RETURNING id`,
      [`areas-${R}-${n++}@iitbhu.ac.in`, `Member ${n}`]
    );
    const token = generateOpaqueToken(48);
    await new SessionRepo(db).create({
      authMethod: "otp",
      personId: row.rows[0]!.id,
      sessionHash: hashSecret(token, env.AUTH_SECRET_PEPPER),
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null
    });
    return { id: row.rows[0]!.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  const req = (method: "GET" | "PUT" | "PATCH", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("saves the whole list in order, merges repeats, and shows it on the profile", async () => {
    const me = await member();
    const viewer = await member();
    const put = await req("PUT", "/v1/me/areas", me, { areas: [" Pricing ", "pricing", "D2C   growth"] });
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json()).toEqual({ areas: ["Pricing", "D2C growth"] });
    expect((await req("GET", "/v1/me/areas", me)).json()).toEqual({ areas: ["Pricing", "D2C growth"] });
    const profile = (await req("GET", `/v1/profiles/${me.id}`, viewer)).json() as { areas: string[] };
    expect(profile.areas).toEqual(["Pricing", "D2C growth"]);

    expect((await req("PUT", "/v1/me/areas", me, { areas: ["Supply chain"] })).json()).toEqual({ areas: ["Supply chain"] });
    expect((await req("PUT", "/v1/me/areas", me, { areas: [] })).json()).toEqual({ areas: [] });
    const rows = await db.query("SELECT 1 FROM person_areas WHERE person_id = $1", [me.id]);
    expect(rows.rowCount).toBe(0);
  });

  it("refuses more than 8, an area over 40 characters, and anything that isn't a list", async () => {
    const me = await member();
    const nine = Array.from({ length: 9 }, (_, i) => `Area ${i}`);
    expect((await req("PUT", "/v1/me/areas", me, { areas: nine })).statusCode).toBe(400);
    expect((await req("PUT", "/v1/me/areas", me, { areas: ["x".repeat(41)] })).statusCode).toBe(400);
    expect((await req("PUT", "/v1/me/areas", me, { areas: "Pricing" })).statusCode).toBe(400);
  });

  it("the database itself refuses a ninth area and a repeat in different case", async () => {
    const me = await member();
    await db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, 'Pricing', 0)`, [me.id]);
    await expect(db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, 'PRICING', 1)`, [me.id])).rejects.toThrow();
    await expect(db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, 'Other', 8)`, [me.id])).rejects.toThrow();
    await expect(db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, ' padded', 2)`, [me.id])).rejects.toThrow();
  });

  it("suggests areas other members use, most-used first, and ignores unfinished profiles", async () => {
    const tag = `Zq${R.slice(-6)}`;
    const a = await member();
    const b = await member();
    const hidden = await member({ complete: false });
    const viewer = await member();
    await req("PUT", "/v1/me/areas", a, { areas: [`${tag} pricing`] });
    await req("PUT", "/v1/me/areas", b, { areas: [`${tag} pricing`, `${tag} ops`] });
    await db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, $2, 0)`, [hidden.id, `${tag} secret`]);

    const res = await req("GET", `/v1/areas/suggestions?q=${encodeURIComponent(tag.toLowerCase())}`, viewer);
    expect(res.statusCode).toBe(200);
    const { suggestions } = res.json() as { suggestions: Array<{ label: string; memberCount: number }> };
    expect(suggestions).toEqual([
      { label: `${tag} pricing`, memberCount: 2 },
      { label: `${tag} ops`, memberCount: 1 }
    ]);
    const second = (await req("GET", `/v1/areas/suggestions?q=${encodeURIComponent("pricin")}`, viewer)).json() as {
      suggestions: Array<{ label: string }>;
    };
    expect(second.suggestions.some((s) => s.label === `${tag} pricing`)).toBe(true);
    expect(((await req("GET", "/v1/areas/suggestions?q=z", viewer)).json() as { suggestions: unknown[] }).suggestions).toEqual([]);
  });

  it("open-to saves no longer keep a line under each tag", async () => {
    const me = await member();
    const res = await req("PATCH", "/v1/me/profile", me, {
      openToPreferences: { selected: ["intros"], descriptions: { intros: "old app still sends this" } }
    });
    expect(res.statusCode, res.body).toBe(200);
    const stored = await db.query<{ open_to_preferences: unknown }>("SELECT open_to_preferences FROM people WHERE id = $1", [me.id]);
    expect(stored.rows[0]!.open_to_preferences).toEqual({ selected: ["intros"] });
  });
});
