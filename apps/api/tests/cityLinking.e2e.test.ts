import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { V1_CACHE_MS, V1_EMPTY_CACHE_MS } from "../src/services/citiesService.js";
import { PlaceReviewService, historySummary } from "../src/services/placeReviewService.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
const R = `ln${run}`;

/**
 * Auto-linking: when a city becomes approved, gets a spelling, or has another city combined into it,
 * members who already typed it (same country) are linked in the same step. Local test database only.
 */
describe("city linking (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  const who: Record<string, Who> = {};
  const savedFlag = env.CITY_REVIEW_ENABLED;

  const req = (method: "GET" | "POST" | "PATCH", url: string, w: Who | null, payload?: unknown) =>
    app.inject({ method, url, headers: w ? { cookie: w.cookie } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });
  /** Typed text saved with no link, the way older profiles are. */
  const typed = (w: Who, city: string | null, country: string | null) =>
    db.query(`UPDATE people SET residence_city = $2, residence_country = $3, residence_canonical_place_id = NULL WHERE id = $1`, [
      w.personId,
      city,
      country,
    ]);
  const linkOf = async (w: Who) =>
    (await db.query<{ place_id: string | null; city: string | null }>(
      `SELECT residence_canonical_place_id AS place_id, residence_city AS city FROM people WHERE id = $1`,
      [w.personId]
    )).rows[0]!;
  const history = async (placeId: string) =>
    (await db.query<{ action: string; detail: Record<string, unknown> }>(
      `SELECT action, detail FROM place_history WHERE place_id = $1 ORDER BY created_at, id`,
      [placeId]
    )).rows;
  const approvedPlace = async (city: string, country = "India") =>
    (await db.query<{ id: string }>(`INSERT INTO canonical_places (country, city_label) VALUES ($1, $2) RETURNING id`, [country, city])).rows[0]!.id;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string) => {
      const p = await loginForTest(app, `ln-${key.toLowerCase()}-${run}@iitbhu.ac.in`);
      await db.query(`UPDATE people SET full_name = $2, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`, [
        p.personId,
        `${key} ${run}`,
      ]);
      who[key] = p;
      return p;
    };
    admin = await person("admin");
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    for (const k of ["a", "b", "c", "pak", "nocountry", "linkedElsewhere", "incomplete", "p1", "p2", "y1", "s1", "r1"]) await person(k);
    // Not directory-listed (profile not finished): still linked, like a profile save would.
    await db.query(`UPDATE people SET profile_completed_at = NULL WHERE id = $1`, [who.incomplete!.personId]);
  });

  afterEach(() => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = savedFlag;
  });

  afterAll(async () => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = savedFlag;
    await db?.end();
    await app?.close();
  });

  it("only admins can use Location cleanup", async () => {
    expect((await req("GET", "/v1/admin/locations/cleanup/inbox", null)).statusCode).toBe(401);
    expect((await req("GET", "/v1/admin/locations/cleanup/inbox", who.a!)).statusCode).toBe(403);
    expect((await req("POST", "/v1/admin/locations/cities", who.a!, { country: "India", cityLabel: `X${R}` })).statusCode).toBe(403);
  });

  it("create city from typed text: a proper name, extra spellings, and everyone who typed any of them in that country is linked", async () => {
    const elsewhere = await approvedPlace(`Elsewhere${R}`);
    await typed(who.a!, `bangalore${R}`, "India");
    await typed(who.b!, `  BANGALORE${R} `, "india");
    await typed(who.c!, `blr${R}`, "India");
    await typed(who.incomplete!, `Bangalore${R}`, "India");
    await typed(who.pak!, `bangalore${R}`, "Pakistan"); // other country: never
    await typed(who.nocountry!, `bangalore${R}`, null); // no country: never guessed
    await typed(who.linkedElsewhere!, `bangalore${R}`, "India");
    await db.query(`UPDATE people SET residence_canonical_place_id = $2 WHERE id = $1`, [who.linkedElsewhere!.personId, elsewhere]);

    const inbox = (await req("GET", "/v1/admin/locations/cleanup/inbox", admin)).json() as {
      unmappedClusters: Array<{ displayCity: string; displayCountry: string; profiles: number; normCity: string }>;
      approvedCities: Array<{ id: string; city: string }>;
    };
    const cluster = inbox.unmappedClusters.find((c) => c.normCity === `bangalore${R}`.toLowerCase() && c.displayCountry.toLowerCase() === "india");
    expect(cluster?.profiles).toBe(3); // a, b and the unfinished profile, grouped ignoring capitals and spaces

    const res = await req("POST", "/v1/admin/locations/cleanup/actions/create-city-from-text", admin, {
      displayCountry: cluster!.displayCountry,
      displayCity: cluster!.displayCity,
      cityLabel: `Bengaluru${R}`,
      extraSpellings: [`blr${R}`, `Banglore${R}`],
    });
    expect(res.statusCode, res.body).toBe(201);
    const out = res.json() as { profilesUpdated: number; cityLabel: string; placeId: string };
    expect(out.cityLabel).toBe(`Bengaluru${R}`);
    expect(out.profilesUpdated).toBe(4);
    for (const k of ["a", "b", "c", "incomplete"]) expect((await linkOf(who[k]!)).place_id).toBe(out.placeId);
    expect((await linkOf(who.pak!)).place_id).toBeNull();
    expect((await linkOf(who.nocountry!)).place_id).toBeNull();
    expect((await linkOf(who.linkedElsewhere!)).place_id).toBe(elsewhere); // never moved
    expect((await linkOf(who.b!)).city).toBe(`  BANGALORE${R} `); // typed text untouched

    const aliases = (await db.query<{ a: string }>(`SELECT alias_normalized AS a FROM place_aliases WHERE canonical_place_id = $1`, [out.placeId])).rows.map((r) => r.a);
    expect(aliases).toEqual(expect.arrayContaining([`bengaluru${R}`, `bangalore${R}`, `blr${R}`, `banglore${R}`].map((a) => a.toLowerCase())));
    const h = await history(out.placeId);
    expect(h.map((x) => x.action)).toEqual(expect.arrayContaining(["submitted", "alias_added", "approved"]));
    const approved = h.find((x) => x.action === "approved")!;
    expect(approved.detail.linkedMembers).toBe(4);
    expect(historySummary({ action: "approved", place_city: `Bengaluru${R}`, target_city: null, reason: null, detail: approved.detail })).toContain("Linked 4 members");
  });

  it("add a city from scratch links members who typed it; a duplicate is refused", async () => {
    await typed(who.p1!, `PUNE${R}`, "India");
    const res = await req("POST", "/v1/admin/locations/cities", admin, { country: "India", cityLabel: `Pune${R}`, spellings: [`poona${R}`] });
    expect(res.statusCode, res.body).toBe(201);
    const out = res.json() as { placeId: string; linkedMembers: number };
    expect(out.linkedMembers).toBe(1);
    expect((await linkOf(who.p1!)).place_id).toBe(out.placeId);
    const again = await req("POST", "/v1/admin/locations/cities", admin, { country: "India", cityLabel: `pune${R}` });
    expect(again.statusCode).toBe(409);
  });

  it("a new spelling on an approved city links members who typed it", async () => {
    const id = await approvedPlace(`Gurugram${R}`);
    await typed(who.s1!, `gurgaon${R}`, "India");
    const res = await req("POST", `/v1/admin/locations/places/${id}/spelling-alias`, admin, { spelling: `Gurgaon${R}` });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { linkedMembers: number }).linkedMembers).toBe(1);
    expect((await linkOf(who.s1!)).place_id).toBe(id);
    const last = (await history(id)).at(-1)!;
    expect(last).toMatchObject({ action: "alias_added", detail: { linkedMembers: 1 } });
  });

  it("combining links members who typed the other city's spellings", async () => {
    const keep = await approvedPlace(`Mumbai${R}`);
    const other = await approvedPlace(`Bombay${R}`);
    await db.query(`INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1, $2)`, [other, `bmb${R}`.toLowerCase()]);
    await typed(who.y1!, `BMB${R}`, "India"); // typed a spelling of the other city, never linked
    const res = await req("POST", "/v1/admin/locations/cleanup/actions/combine-cities", admin, { keepCityId: keep, combineCityId: other });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { linkedMembers: number }).linkedMembers).toBe(1);
    expect((await linkOf(who.y1!)).place_id).toBe(keep);
    const combined = (await history(other)).find((x) => x.action === "combined")!;
    expect(combined.detail.linkedMembers).toBe(1);
  });

  it("approving a pending city links the others who typed it; pending and rejected cities never auto-link", async () => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = true;
    // r1 types a new city: it is created approved and r1 is linked to it. The queue mechanics below
    // still take pending rows, so this one is held pending the way older rows exist.
    expect((await req("PATCH", "/v1/me/profile", who.r1!, { residenceCity: `Kanpurx${R}`, residenceCountry: "India" })).statusCode).toBe(200);
    const pendingId = (await linkOf(who.r1!)).place_id!;
    expect(pendingId).toBeTruthy();
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [pendingId]);
    // p2's same text is from before (unlinked).
    await typed(who.p2!, `KANPURX${R}`, "India");
    // A spelling on a pending city does not link anyone.
    const alias = await req("POST", `/v1/admin/locations/places/${pendingId}/spelling-alias`, admin, { spelling: `knp${R}` });
    expect((alias.json() as { linkedMembers: number }).linkedMembers).toBe(0);
    expect((await linkOf(who.p2!)).place_id).toBeNull();

    const ok = await req("POST", `/v1/admin/cities/${pendingId}/approve`, admin, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect((ok.json() as { city: { linkedMembers: number } }).city.linkedMembers).toBe(1);
    expect((await linkOf(who.p2!)).place_id).toBe(pendingId);
    expect((await history(pendingId)).find((x) => x.action === "approved" && x.detail.linkedMembers !== undefined)!.detail.linkedMembers).toBe(1);

    // A rejected city: someone who typed it stays unlinked.
    expect((await req("PATCH", "/v1/me/profile", who.r1!, { residenceCity: `Nowhere${R}`, residenceCountry: "India" })).statusCode).toBe(200);
    const rejectId = (await linkOf(who.r1!)).place_id!;
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [rejectId]);
    expect((await req("POST", `/v1/admin/cities/${rejectId}/reject`, admin, { reason: "Not a city" })).statusCode).toBe(204);
    await typed(who.p2!, `nowhere${R}`, "India");
    await req("POST", `/v1/admin/locations/places/${rejectId}/spelling-alias`, admin, { spelling: `nwh${R}` });
    expect((await linkOf(who.p2!)).place_id).toBeNull();
  });

  it("Cities v1 lookup: approved only, by name or spelling, inside the country; 'not found' is cached briefly", async () => {
    const review = new PlaceReviewService(db);
    const id = await approvedPlace(`V1city${R}`);
    await db.query(`INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1, $2)`, [id, `v1alias${R}`.toLowerCase()]);
    expect((await review.approvedCity(`v1city${R}`, "India"))?.id).toBe(id);
    expect((await review.approvedCity(`V1ALIAS${R}`, "india"))?.id).toBe(id);
    expect(await review.approvedCity(`v1city${R}`, "Pakistan")).toBeNull();
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [id]);
    expect(await review.approvedCity(`v1city${R}`, "India")).toBeNull();
    expect(V1_EMPTY_CACHE_MS).toBeLessThanOrEqual(30_000);
    expect(V1_CACHE_MS).toBe(600_000);
  });
});
