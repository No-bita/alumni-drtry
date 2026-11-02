import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { CITY_SUBMISSIONS_MAX } from "../src/services/placeReviewService.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
type CitiesList = {
  viewerCity: { placeId: string; city: string; status?: string } | null;
  viewerResidence: { city: string | null; country: string | null } | null;
};
const run = Date.now();
const R = `ce${run}`;

/**
 * City entry: members type a city and save. Whatever happens behind the scenes (linked, waiting for review,
 * or left as typed text), the typed text is kept and GET /v1/cities says truthfully which it is.
 */
describe("city entry: typed text is kept in every outcome (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
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
  const list = async (w: Who) => (await req("GET", "/v1/cities", w)).json() as CitiesList;
  const typed = async (w: Who) =>
    (await db.query<{ city: string | null; country: string | null; place_id: string | null }>(
      `SELECT residence_city AS city, residence_country AS country, residence_canonical_place_id AS place_id FROM people WHERE id = $1`,
      [w.personId]
    )).rows[0]!;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string) => {
      const p = await loginForTest(app, `ce-${key}-${run}@iitbhu.ac.in`);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = 2019, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
        [p.personId, `${key} ${run}`]
      );
      who[key] = p;
      return p;
    };
    admin = await person("admin");
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    for (const k of ["off", "fresh", "capper", "first", "retyper", "known", "countryonly"]) await person(k);
  });

  afterEach(() => setFlag(savedFlag));

  afterAll(async () => {
    setFlag(savedFlag);
    await db?.end();
    await app?.close();
  });

  it("nothing saved: no viewerResidence; a saved country alone is reported so it can be reused", async () => {
    expect((await list(who.countryonly!)).viewerResidence).toBeNull();
    const res = await req("PATCH", "/v1/me/profile", who.countryonly!, { residenceCountry: "India" });
    expect(res.statusCode, res.body).toBe(200);
    expect((await list(who.countryonly!)).viewerResidence).toEqual({ city: null, country: "India" });
  });

  it("switch off: an unfamiliar city is kept as typed, not linked, and reported as saved", async () => {
    setFlag(false);
    await save(who.off!, `Off Town ${R}`);
    expect(await typed(who.off!)).toEqual({ city: `Off Town ${R}`, country: "India", place_id: null });
    const l = await list(who.off!);
    expect(l.viewerCity).toBeNull();
    expect(l.viewerResidence).toEqual({ city: `Off Town ${R}`, country: "India" });
  });

  it("switch on: an unfamiliar city links to a pending city; the typed text is kept", async () => {
    setFlag(true);
    await save(who.fresh!, `Fresh Town ${R}`);
    const l = await list(who.fresh!);
    expect(l.viewerCity?.status).toBe("pending");
    expect(l.viewerResidence).toEqual({ city: `Fresh Town ${R}`, country: "India" });
  });

  it(`over the limit of ${CITY_SUBMISSIONS_MAX} new cities: kept as typed, not linked, not pending`, async () => {
    setFlag(true);
    for (let i = 0; i < CITY_SUBMISSIONS_MAX; i += 1) await save(who.capper!, `Cap ${i} ${R}`);
    await save(who.capper!, `Cap over ${R}`);
    const l = await list(who.capper!);
    expect(l.viewerCity).toBeNull();
    expect(l.viewerResidence).toEqual({ city: `Cap over ${R}`, country: "India" });
    const pending = await db.query(`SELECT 1 FROM canonical_places WHERE city_label = $1`, [`Cap over ${R}`]);
    expect(pending.rowCount).toBe(0);
  });

  it("a rejected city typed again: kept as typed, not linked, not reopened", async () => {
    setFlag(true);
    await save(who.first!, `Nope Town ${R}`);
    const placeId = (await list(who.first!)).viewerCity!.placeId;
    const rej = await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "Not a city" });
    expect(rej.statusCode, rej.body).toBeLessThan(300);
    await save(who.retyper!, `Nope Town ${R}`);
    const l = await list(who.retyper!);
    expect(l.viewerCity).toBeNull();
    expect(l.viewerResidence).toEqual({ city: `Nope Town ${R}`, country: "India" });
    const status = await db.query<{ status: string }>(`SELECT status FROM canonical_places WHERE id = $1`, [placeId]);
    expect(status.rows[0]!.status).toBe("rejected");
  });

  it("a known spelling links to the approved city; the member's own spelling is kept", async () => {
    setFlag(false);
    const place = (await db.query<{ id: string }>(`INSERT INTO canonical_places (country, city_label) VALUES ('India', $1) RETURNING id`, [`Known ${R}`])).rows[0]!.id;
    await db.query(`INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1, $2)`, [place, `known spelling ${R}`.toLowerCase()]);
    await save(who.known!, `Known Spelling ${R}`);
    const l = await list(who.known!);
    expect(l.viewerCity?.placeId).toBe(place);
    expect(l.viewerCity?.status).toBe("approved");
    expect(l.viewerResidence).toEqual({ city: `Known Spelling ${R}`, country: "India" });
  });
});
