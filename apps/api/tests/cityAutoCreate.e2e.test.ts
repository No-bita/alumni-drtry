import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
const R = `ac${run}`;

/**
 * Automatic city creation: with creation on, an unknown typed city becomes an approved city whose
 * full page exists right away. Members who typed the same name while creation was off join it.
 * Local test database only.
 */
describe("automatic city creation (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  const who: Record<string, Who> = {};
  const savedFlag = env.CITY_REVIEW_ENABLED;
  const setFlag = (on: boolean) => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = on;
  };

  const req = (method: "GET" | "POST" | "PATCH", url: string, w: Who, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: w.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const save = async (w: Who, residenceCity: string, residenceCountry = "India") => {
    const res = await req("PATCH", "/v1/me/profile", w, { residenceCity, residenceCountry });
    expect(res.statusCode, res.body).toBe(200);
  };
  const linkOf = async (w: Who) =>
    (await db.query<{ place_id: string | null }>(
      `SELECT residence_canonical_place_id AS place_id FROM people WHERE id = $1`,
      [w.personId]
    )).rows[0]!;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string) => {
      const p = await loginForTest(app, `ac-${key}-${run}@iitbhu.ac.in`);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = 2019, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
        [p.personId, `${key} ${run}`]
      );
      who[key] = p;
      return p;
    };
    for (const k of ["early", "creator", "visitor"]) await person(k);
  });

  afterEach(() => setFlag(savedFlag));

  afterAll(async () => {
    setFlag(savedFlag);
    await db?.end();
    await app?.close();
  });

  it("a member who typed the name while creation was off is linked when the city is created", async () => {
    setFlag(false);
    await save(who.early!, `Linkville ${R}`);
    expect((await linkOf(who.early!)).place_id).toBeNull();

    setFlag(true);
    await save(who.creator!, `linkville ${R}`);
    const placeId = (await linkOf(who.creator!)).place_id;
    expect(placeId).toBeTruthy();
    // Same normalized name in the same country: the earlier typer joins in the same step.
    expect((await linkOf(who.early!)).place_id).toBe(placeId);
    const aliases = await db.query<{ a: string }>(
      `SELECT alias_normalized AS a FROM place_aliases WHERE canonical_place_id = $1`,
      [placeId]
    );
    expect(aliases.rows.map((r) => r.a)).toContain(`linkville ${R}`.toLowerCase());
  });

  it("an unconfigured auto-created city gets the full page", async () => {
    setFlag(true);
    await save(who.creator!, `Pageville ${R}`);
    const placeId = (await linkOf(who.creator!)).place_id!;
    // Not in CITIES_V1_PLACE_IDS (unset in tests) and not the Bengaluru default.
    const page = (await req("GET", `/v1/cities/${placeId}`, who.creator!)).json() as {
      v1Enabled: boolean;
      alumni: unknown;
      counts: { alumni: number };
    };
    expect(page.v1Enabled).toBe(true);
    expect(page.alumni).not.toBeNull();
    expect(page.counts.alumni).toBe(1);
    const stranger = (await req("GET", `/v1/cities/${placeId}`, who.visitor!)).json() as { v1Enabled: boolean };
    expect(stranger.v1Enabled).toBe(true);
  });
});
