import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { COUNTRY_NAMES, countryMatchKeys, normalizeCountry } from "../src/lib/countries.js";
import { CITY_SUBMISSIONS_MAX, historySummary } from "../src/services/placeReviewService.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
const R = `rv${run}`;

describe("countries", () => {
  it("one name per country; unknown ones stay as typed", () => {
    expect(normalizeCountry(" usa ")).toBe("United States");
    expect(normalizeCountry("U.K.")).toBe("United Kingdom");
    expect(normalizeCountry("uae")).toBe("United Arab Emirates");
    expect(normalizeCountry("india")).toBe("India");
    expect(normalizeCountry("Atlantis  Republic")).toBe("Atlantis Republic");
    expect(countryMatchKeys("United States")).toEqual(expect.arrayContaining(["united states", "usa", "us"]));
  });

  it("the API list matches the web's country list", () => {
    const web = readFileSync(new URL("../../web/src/constants/phoneCountries.ts", import.meta.url), "utf8");
    const names = [...new Set([...web.matchAll(/"name": "([^"]+)"/g)].map((m) => m[1]))];
    expect([...COUNTRY_NAMES]).toEqual(names);
  });
});

describe("city review (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  const who: Record<string, Who> = {};
  const savedFlag = env.CITY_REVIEW_ENABLED;

  const req = (method: "GET" | "POST" | "PATCH", url: string, w: Who | null, payload?: unknown) =>
    app.inject({ method, url, headers: w ? { cookie: w.cookie } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const setCity = (w: Who, residenceCity: string, residenceCountry = "India") =>
    req("PATCH", "/v1/me/profile", w, { residenceCity, residenceCountry });
  const linkOf = async (w: Who) =>
    (await db.query<{ place_id: string | null; city: string | null; country: string | null }>(
      `SELECT residence_canonical_place_id AS place_id, residence_city AS city, residence_country AS country FROM people WHERE id = $1`,
      [w.personId]
    )).rows[0]!;
  const placeRow = async (id: string) =>
    (await db.query<{ status: string; city_label: string; combined_into_place_id: string | null; rejection_reason: string | null; country: string }>(
      `SELECT status, city_label, combined_into_place_id, rejection_reason, country FROM canonical_places WHERE id = $1`,
      [id]
    )).rows[0]!;
  const placesNamed = async (label: string) =>
    (await db.query<{ id: string; status: string }>(`SELECT id, status FROM canonical_places WHERE lower(city_label) = lower($1)`, [label])).rows;
  const history = async (placeId: string) =>
    (await db.query<{ action: string; actor_person_id: string | null; reason: string | null; target_place_id: string | null; detail: Record<string, unknown> }>(
      `SELECT action, actor_person_id, reason, target_place_id, detail FROM place_history WHERE place_id = $1 ORDER BY created_at, id`,
      [placeId]
    )).rows;
  const approvedPlace = async (city: string, country = "India") =>
    (await db.query<{ id: string }>(`INSERT INTO canonical_places (country, city_label) VALUES ($1, $2) RETURNING id`, [country, city])).rows[0]!.id;
  const queue = async (status = "pending") =>
    ((await req("GET", `/v1/admin/cities/review?status=${status}&q=${R}`, admin)).json() as { cities: Array<Record<string, any>> }).cities;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string, name: string) => {
      const p = await loginForTest(app, `cr-${key}-${run}@iitbhu.ac.in`);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = 2019, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
        [p.personId, `${name} ${run}`]
      );
      who[key] = p;
      return p;
    };
    admin = await person("admin", "Admin");
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    for (const k of ["sub", "join", "stranger", "late", "racer1", "racer2", "capper", "usa", "gone", "mover", "junker", "waiter"]) await person(k, k);
  });

  afterEach(() => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = savedFlag;
  });

  afterAll(async () => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = savedFlag;
    await db?.end();
    await app?.close();
  });

  const on = () => {
    (env as { CITY_REVIEW_ENABLED: boolean }).CITY_REVIEW_ENABLED = true;
  };

  it("switch off: an unknown city stays typed text, no pending city, queue is 404; no other-country match", async () => {
    await approvedPlace(`Hydra${R}`, "India");
    expect((await setCity(who.stranger!, `Hydra${R}`, "Pakistan")).statusCode).toBe(200);
    expect((await linkOf(who.stranger!)).place_id).toBeNull();
    expect((await setCity(who.stranger!, `Offcity${R}`)).statusCode).toBe(200);
    expect((await linkOf(who.stranger!)).place_id).toBeNull();
    expect(await placesNamed(`Offcity${R}`)).toEqual([]);
    expect((await req("GET", "/v1/admin/cities/review", admin)).statusCode).toBe(404);
  });

  it("switch on: an unknown city becomes approved, linked, with submitted+approved history rows; visible in browse and search", async () => {
    on();
    expect((await setCity(who.sub!, `  Leedsy${R} `)).statusCode).toBe(200);
    const link = await linkOf(who.sub!);
    expect(link.place_id).toBeTruthy();
    expect(await placeRow(link.place_id!)).toMatchObject({ status: "approved", city_label: `Leedsy${R}`, country: "India" });
    const h = await history(link.place_id!);
    expect(h).toEqual([
      expect.objectContaining({ action: "submitted", actor_person_id: who.sub!.personId }),
      expect.objectContaining({ action: "approved", actor_person_id: who.sub!.personId })
    ]);
    expect(h[0]!.detail.source).toBe("member");
    expect(h[0]!.detail.auto).toBe(true);
    expect(h[1]!.detail.source).toBe("member_auto");

    // A second member typing the same city joins it (no new city).
    expect((await setCity(who.join!, `leedsy${R}`)).statusCode).toBe(200);
    expect((await linkOf(who.join!)).place_id).toBe(link.place_id);
    expect(await placesNamed(`Leedsy${R}`)).toHaveLength(1);

    const list = (await req("GET", "/v1/cities", who.sub!)).json() as { viewerCity: any; cities: Array<{ placeId: string }> };
    expect(list.viewerCity).toMatchObject({ placeId: link.place_id, status: "approved" });
    expect(list.cities.some((c) => c.placeId === link.place_id)).toBe(true);
    const search = (await req("GET", `/v1/cities/search?q=leedsy${R}`, who.sub!)).json() as { places: unknown[] };
    expect(search.places).toHaveLength(1);
    const agg = (await req("GET", "/v1/directory/residence-cities?limit=120", who.sub!)).json() as { cities: Array<{ city: string }> };
    expect(agg.cities.some((c) => c.city.toLowerCase() === `leedsy${R}`.toLowerCase())).toBe(true);
  });

  it("pending page: linked members and admins only; profiles show the typed text", async () => {
    // Member saves create approved cities now; a pending row is set up the way older ones exist.
    const placeId = (await linkOf(who.sub!)).place_id!;
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [placeId]);
    const mine = await req("GET", `/v1/cities/${placeId}`, who.sub!);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().review).toMatchObject({ status: "pending", rejectionReason: null });
    expect((await req("GET", `/v1/cities/${placeId}`, who.join!)).statusCode).toBe(200);
    expect((await req("GET", `/v1/cities/${placeId}`, admin)).statusCode).toBe(200);
    expect((await req("GET", `/v1/cities/${placeId}`, who.stranger!)).statusCode).toBe(404);
    expect((await req("GET", `/v1/cities/${placeId}/alumni`, who.stranger!)).statusCode).toBe(404);
    const profile = (await req("GET", `/v1/profiles/${who.join!.personId}`, who.stranger!)).json() as Record<string, any>;
    expect(JSON.stringify(profile)).toContain(`leedsy${R}`);
  });

  it("two members submitting the same new city at once get one city and one history row", async () => {
    on();
    const [a, b] = await Promise.all([setCity(who.racer1!, `Racetown${R}`), setCity(who.racer2!, `Racetown${R}`)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const rows = await placesNamed(`Racetown${R}`);
    expect(rows).toHaveLength(1);
    expect((await linkOf(who.racer1!)).place_id).toBe(rows[0]!.id);
    expect((await linkOf(who.racer2!)).place_id).toBe(rows[0]!.id);
    expect((await history(rows[0]!.id)).filter((x) => x.action === "submitted")).toHaveLength(1);
  });

  it("countries: 'USA' is saved as United States and matches a city stored under 'USA'", async () => {
    on();
    const old = await approvedPlace(`Austinish${R}`, "USA");
    expect((await setCity(who.usa!, `Austinish${R}`, "united states of america")).statusCode).toBe(200);
    const link = await linkOf(who.usa!);
    expect(link).toMatchObject({ place_id: old, country: "United States" });
  });

  it(`a member can create at most ${CITY_SUBMISSIONS_MAX} new cities in 30 days; then it stays typed text`, async () => {
    on();
    for (let i = 0; i < CITY_SUBMISSIONS_MAX; i += 1) {
      await setCity(who.capper!, `Capcity${i}${R}`);
      expect((await linkOf(who.capper!)).place_id).toBeTruthy();
    }
    await setCity(who.capper!, `Capcity9${R}`);
    expect((await linkOf(who.capper!)).place_id).toBeNull();
    expect(await placesNamed(`Capcity9${R}`)).toEqual([]);
  });

  it("queue: admins only; shows city, country, linked members, masked submitter and spellings", async () => {
    on();
    expect((await req("GET", "/v1/admin/cities/review", who.sub!)).statusCode).toBe(403);
    const row = (await queue()).find((c) => c.city === `Leedsy${R}`)!;
    expect(row).toMatchObject({ country: "India", status: "pending", linkedMembers: 2 });
    expect(row.submittedByEmailMasked).toBe("cr•••@iitbhu.ac.in");
    expect(JSON.stringify(row)).not.toContain(`cr-sub-${run}`);
  });

  it("reject needs a reason; the reason is for the submitter and admins; members stay linked; retyping never reopens it", async () => {
    on();
    const placeId = (await linkOf(who.sub!)).place_id!;
    expect((await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "x" })).json().code).toBe("CITY_REJECT_REASON_REQUIRED");
    expect((await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "Not a real city name" })).statusCode).toBe(204);
    expect(await placeRow(placeId)).toMatchObject({ status: "rejected", rejection_reason: "Not a real city name" });
    expect((await linkOf(who.join!)).place_id).toBe(placeId);

    const forSubmitter = (await req("GET", `/v1/cities/${placeId}`, who.sub!)).json();
    expect(forSubmitter.review).toEqual({ status: "rejected", message: "This city wasn't added.", rejectionReason: "Not a real city name" });
    const forOther = (await req("GET", `/v1/cities/${placeId}`, who.join!)).json();
    expect(forOther.review).toMatchObject({ status: "rejected", rejectionReason: null });
    expect((await req("GET", `/v1/cities/${placeId}`, admin)).json().review.rejectionReason).toBe("Not a real city name");
    expect((await req("GET", `/v1/cities/${placeId}`, who.stranger!)).statusCode).toBe(404);

    expect((await setCity(who.late!, `Leedsy${R}`)).statusCode).toBe(200);
    expect((await linkOf(who.late!)).place_id).toBeNull();
    expect((await placeRow(placeId)).status).toBe("rejected");
    expect(await placesNamed(`Leedsy${R}`)).toHaveLength(1);
    expect((await queue("rejected")).some((c) => c.id === placeId)).toBe(true);
  });

  it("hide: an approved city can be hidden with a reason; members stay linked; restoring re-links waiting typers", async () => {
    on();
    expect((await setCity(who.junker!, `Junk${R}`)).statusCode).toBe(200);
    const placeId = (await linkOf(who.junker!)).place_id!;
    expect((await placeRow(placeId)).status).toBe("approved");

    const hide = await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "Not a real place" });
    expect(hide.statusCode).toBe(204);
    expect(await placeRow(placeId)).toMatchObject({ status: "rejected", rejection_reason: "Not a real place" });

    // The member stays linked; their own list shows the city as rejected, and it leaves every approved-only surface.
    expect((await linkOf(who.junker!)).place_id).toBe(placeId);
    const list = (await req("GET", "/v1/cities", who.junker!)).json() as { viewerCity: any; cities: Array<{ placeId: string }> };
    expect(list.viewerCity).toMatchObject({ placeId, status: "rejected" });
    expect(list.cities.some((c) => c.placeId === placeId)).toBe(false);
    const search = (await req("GET", `/v1/cities/search?q=junk${R}`, who.junker!)).json() as { places: unknown[] };
    expect(search.places).toHaveLength(0);
    const agg = (await req("GET", `/v1/directory/residence-cities?limit=120`, who.junker!)).json() as { cities: Array<{ city: string }> };
    expect(agg.cities.some((c) => c.city.toLowerCase() === `junk${R}`.toLowerCase())).toBe(false);

    // The member sees the reason on the city page; outsiders get 404.
    const mine = await req("GET", `/v1/cities/${placeId}`, who.junker!);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().review).toMatchObject({ status: "rejected", rejectionReason: "Not a real place" });
    expect((await req("GET", `/v1/cities/${placeId}`, who.stranger!)).statusCode).toBe(404);

    // While hidden, someone typing the same name stays unlinked (rejected never re-links).
    expect((await setCity(who.waiter!, `junk${R}`)).statusCode).toBe(200);
    expect((await linkOf(who.waiter!)).place_id).toBeNull();

    // History records the hide with the previous status; hiding again conflicts.
    const h = await history(placeId);
    expect(h[h.length - 1]).toMatchObject({ action: "rejected", actor_person_id: admin.personId, reason: "Not a real place" });
    expect(h[h.length - 1]!.detail.previousStatus).toBe("approved");
    expect((await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "Twice" })).statusCode).toBe(409);

    // Restore: reopen puts it back in the queue; approving re-links the waiting typer automatically.
    expect((await req("POST", `/v1/admin/cities/${placeId}/reopen`, admin, {})).statusCode).toBe(204);
    const ok = await req("POST", `/v1/admin/cities/${placeId}/approve`, admin, {});
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await placeRow(placeId)).status).toBe("approved");
    expect((await linkOf(who.junker!)).place_id).toBe(placeId);
    expect((await linkOf(who.waiter!)).place_id).toBe(placeId);
  });

  it("reopen puts a rejected city back in the queue; history records each step", async () => {
    on();
    const placeId = (await linkOf(who.sub!)).place_id!;
    expect((await req("POST", `/v1/admin/cities/${placeId}/reopen`, admin)).statusCode).toBe(204);
    expect(await placeRow(placeId)).toMatchObject({ status: "pending", rejection_reason: null });
    expect((await req("POST", `/v1/admin/cities/${placeId}/reopen`, admin)).json().code).toBe("CITY_NOT_REJECTED");
    expect((await history(placeId)).map((x) => x.action)).toEqual(["submitted", "approved", "rejected", "reopened"]);
    const hist = (await req("GET", `/v1/admin/cities/${placeId}/history`, admin)).json().history as Array<{ summary: string }>;
    expect(hist[0]!.summary).toBe(`Reopened «Leedsy${R}» for review.`);
  });

  it("approve (with a rename) makes the city public; typed text is untouched; profiles show the city's name", async () => {
    on();
    const placeId = (await linkOf(who.sub!)).place_id!;
    const res = await req("POST", `/v1/admin/cities/${placeId}/approve`, admin, { cityLabel: `Leeds Town${R}` });
    expect(res.statusCode, res.body).toBe(200);
    expect(await placeRow(placeId)).toMatchObject({ status: "approved", city_label: `Leeds Town${R}` });
    expect((await linkOf(who.sub!)).city).toBe(`Leedsy${R}`);
    expect((await history(placeId)).map((x) => x.action)).toEqual(["submitted", "approved", "rejected", "reopened", "renamed", "alias_added", "approved"]);
    expect((await req("GET", `/v1/cities/${placeId}`, who.stranger!)).statusCode).toBe(200);
    const list = (await req("GET", "/v1/cities", who.stranger!)).json() as { cities: Array<{ placeId: string }> };
    expect(list.cities.some((c) => c.placeId === placeId)).toBe(true);
    const profile = (await req("GET", `/v1/profiles/${who.sub!.personId}`, who.stranger!)).json() as Record<string, any>;
    expect(JSON.stringify(profile)).toContain(`Leeds Town${R}`);
    expect((await req("POST", `/v1/admin/cities/${placeId}/approve`, admin, {})).json().code).toBe("CITY_NOT_PENDING");
  });

  it("same city as…: a pending city becomes a redirect; members move; typed text kept; the old page opens the new city", async () => {
    on();
    const target = await approvedPlace(`Racetown Proper${R}`);
    const pending = (await placesNamed(`Racetown${R}`))[0]!.id;
    // Queue actions take pending rows; member saves create approved cities now.
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [pending]);
    expect((await req("POST", `/v1/admin/cities/${pending}/same-as`, admin, { targetPlaceId: pending })).statusCode).toBe(400);
    const res = await req("POST", `/v1/admin/cities/${pending}/same-as`, admin, { targetPlaceId: target });
    expect(res.statusCode, res.body).toBe(200);
    expect(await placeRow(pending)).toMatchObject({ status: "combined", combined_into_place_id: target });
    expect(await linkOf(who.racer1!)).toMatchObject({ place_id: target, city: `Racetown${R}` });
    const page = (await req("GET", `/v1/cities/${pending}`, who.stranger!)).json();
    expect(page.place.placeId).toBe(target);
    // Typing the old name now lands on the kept city.
    await setCity(who.late!, `racetown${R}`);
    expect((await linkOf(who.late!)).place_id).toBe(target);
    expect((await history(pending)).at(-1)).toMatchObject({ action: "combined", target_place_id: target, actor_person_id: admin.personId });
  });

  it("safe combine (Location cleanup and admin merge): moves everything, deletes nothing, repoints redirects", async () => {
    const keep = await approvedPlace(`Keepville${R}`);
    const other = await approvedPlace(`Otherville${R}`);
    const older = await approvedPlace(`Olderville${R}`);
    await db.query(`UPDATE canonical_places SET status = 'combined', combined_into_place_id = $1 WHERE id = $2`, [other, older]);
    await db.query(`INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1, $2)`, [other, `ov${R}`]);
    await db.query(
      `UPDATE people SET residence_canonical_place_id = $2, residence_city = 'otherville typed', residence_country = 'India', residence_previous_place_id = $2 WHERE id = $1`,
      [who.mover!.personId, other]
    );
    await db.query(`UPDATE city_arrivals SET ended_at = now(), ended_reason = 'stopped' WHERE person_id = $1 AND ended_at IS NULL`, [who.mover!.personId]);
    await db.query(`INSERT INTO city_arrivals (person_id, place_id, previous_place_id) VALUES ($1, $2, $2)`, [who.mover!.personId, other]);
    await db.query(
      `INSERT INTO intentcasts (author_person_id, content, category, editable_until, place_id) VALUES ($1, 'Otherville meetup this weekend', 'collaboration', now(), $2)`,
      [who.mover!.personId, other]
    );
    const countsBefore = (await db.query<{ c: number }>(`SELECT (SELECT COUNT(*) FROM canonical_places)::int + (SELECT COUNT(*) FROM city_arrivals)::int + (SELECT COUNT(*) FROM intentcasts)::int AS c`)).rows[0]!.c;

    const res = await req("POST", "/v1/admin/locations/cleanup/actions/combine-cities", admin, { keepCityId: keep, combineCityId: other });
    expect(res.statusCode, res.body).toBeLessThan(300);

    expect(await placeRow(other)).toMatchObject({ status: "combined", combined_into_place_id: keep });
    expect((await placeRow(older)).combined_into_place_id).toBe(keep);
    const p = (await db.query(`SELECT residence_canonical_place_id, residence_previous_place_id, residence_city FROM people WHERE id = $1`, [who.mover!.personId])).rows[0];
    expect(p).toEqual({ residence_canonical_place_id: keep, residence_previous_place_id: keep, residence_city: "otherville typed" });
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM city_arrivals WHERE place_id = $1 OR previous_place_id = $1`, [other])).rows[0].c).toBe(0);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM city_arrivals WHERE place_id = $1 AND person_id = $2`, [keep, who.mover!.personId])).rows[0].c).toBe(1);
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM intentcasts WHERE place_id = $1`, [keep])).rows[0].c).toBe(1);
    const aliases = (await db.query<{ a: string }>(`SELECT alias_normalized AS a FROM place_aliases WHERE canonical_place_id = $1`, [keep])).rows.map((r) => r.a);
    expect(aliases).toEqual(expect.arrayContaining([`ov${R}`, `otherville${R}`.toLowerCase()]));
    const countsAfter = (await db.query<{ c: number }>(`SELECT (SELECT COUNT(*) FROM canonical_places)::int + (SELECT COUNT(*) FROM city_arrivals)::int + (SELECT COUNT(*) FROM intentcasts)::int AS c`)).rows[0]!.c;
    expect(countsAfter).toBe(countsBefore);
    expect((await history(other)).at(-1)).toMatchObject({ action: "combined", target_place_id: keep });

    // The admin merge endpoint is the same safe combine.
    const extra = await approvedPlace(`Extraville${R}`);
    expect((await req("POST", "/v1/admin/places/merge", admin, { winnerId: keep, loserId: extra })).statusCode).toBe(204);
    expect(await placeRow(extra)).toMatchObject({ status: "combined", combined_into_place_id: keep });
    // Combining into a city that isn't approved is refused.
    expect((await req("POST", "/v1/admin/places/merge", admin, { winnerId: other, loserId: keep })).statusCode).toBe(400);
  });

  it("a change and its history are saved together: if history can't be written, nothing changes", async () => {
    on();
    await setCity(who.gone!, `Rollback${R}`);
    const placeId = (await linkOf(who.gone!)).place_id!;
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [placeId]);
    await db.query(`
      CREATE OR REPLACE FUNCTION test_fail_rejected_history() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'rejected' AND NEW.reason = 'fail on purpose' THEN RAISE EXCEPTION 'history write failed'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER trg_test_fail_history BEFORE INSERT ON place_history FOR EACH ROW EXECUTE FUNCTION test_fail_rejected_history()`);
    try {
      const res = await req("POST", `/v1/admin/cities/${placeId}/reject`, admin, { reason: "fail on purpose" });
      expect(res.statusCode).toBe(500);
      expect((await placeRow(placeId)).status).toBe("pending");
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS trg_test_fail_history ON place_history`);
      await db.query(`DROP FUNCTION IF EXISTS test_fail_rejected_history()`);
    }
  });

  it("history is permanent: no edits or deletes, cities in it can't be deleted, a deleted person is anonymised", async () => {
    const placeId = (await linkOf(who.gone!)).place_id!;
    await expect(db.query(`UPDATE place_history SET reason = 'edited' WHERE place_id = $1`, [placeId])).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM place_history WHERE place_id = $1`, [placeId])).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM canonical_places WHERE id = $1`, [placeId])).rejects.toThrow();
    await db.query(`UPDATE people SET residence_canonical_place_id = NULL WHERE id = $1`, [who.gone!.personId]);
    await db.query(`DELETE FROM people WHERE id = $1`, [who.gone!.personId]);
    const h = await history(placeId);
    expect(h[0]).toMatchObject({ action: "submitted", actor_person_id: null });
  });

  it("only an approved city can tag a Wall post", async () => {
    on();
    await setCity(who.stranger!, `Walltown${R}`);
    const pending = (await linkOf(who.stranger!)).place_id!;
    // Member saves create approved cities now; hold this one pending to test the gate.
    await db.query(`UPDATE canonical_places SET status = 'pending', reviewed_at = NULL, reviewed_by_person_id = NULL WHERE id = $1`, [pending]);
    const res = await req("POST", "/v1/intentcasts", who.stranger!, {
      content: "Walltown meetup this weekend\nAnyone around for coffee?",
      category: "collaboration",
      placeId: pending
    });
    expect(res.statusCode).toBe(400);
  });

  it("history summaries read plainly", () => {
    expect(historySummary({ action: "combined", place_city: "Gurgaon", target_city: "Gurugram", reason: null, detail: {} })).toBe(
      "Combined «Gurgaon» into «Gurugram»."
    );
    expect(historySummary({ action: "rejected", place_city: "Xyz", target_city: null, reason: "Typo", detail: {} })).toBe("Rejected «Xyz»: Typo");
  });
});
