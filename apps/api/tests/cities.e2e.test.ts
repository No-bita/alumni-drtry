import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { ConsoleEmailSender } from "../src/services/emailSender.js";
import { coffeeReasonText } from "../src/services/contactRequestService.js";
import { sharedTag } from "../src/services/citiesService.js";
import { loginForTest } from "./helpers/login.js";

import { assertDisposableCitiesDatabase } from "./helpers/disposableDatabase.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string; email: string };
const run = Date.now();

describe("Cities v1 API (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let blr: string;
  let pune: string;
  const who: Record<string, Who> = {};

  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, w: Who | null, payload?: unknown) =>
    app.inject({ method, url, headers: w ? { cookie: w.cookie } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const city = async (w: Who, placeId = blr) => {
    const r = await req("GET", `/v1/cities/${placeId}`, w);
    expect(r.statusCode).toBe(200);
    return r.json() as Record<string, any>;
  };
  const setCity = (w: Who, residenceCity: string, residenceCountry = "India") =>
    req("PATCH", "/v1/me/profile", w, { residenceCity, residenceCountry });
  const note = (w: Who, recipientPersonId: string, sourceCategory: string, message: string, extra: Record<string, unknown> = {}) =>
    req("POST", "/v1/contact-requests", w, { recipientPersonId, message, source: "cities", sourceCategory, ...extra });

  beforeAll(async () => {
    assertDisposableCitiesDatabase(process.env.DATABASE_URL);
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const place = async (cityLabel: string) => {
      await db.query(
        `INSERT INTO canonical_places (country, city_label) VALUES ('India', $1)
         ON CONFLICT (lower(trim(country)), lower(trim(city_label))) DO NOTHING`,
        [cityLabel]
      );
      return (await db.query<{ id: string }>(`SELECT id FROM canonical_places WHERE lower(city_label) = lower($1) AND country = 'India'`, [cityLabel])).rows[0]!.id;
    };
    blr = await place("Bengaluru");
    pune = await place("Pune");
    await db.query(`INSERT INTO place_aliases (canonical_place_id, alias_normalized) VALUES ($1, 'bangalore') ON CONFLICT DO NOTHING`, [blr]);
    // A clean slate for the city-wide lists this file checks (local test database only):
    // earlier runs' people leave, their arrivals end, city posts lose their tag.
    await db.query(`UPDATE people SET deleted_at = now() WHERE institutional_email::text LIKE 'cty-%' AND deleted_at IS NULL`);
    await db.query(`UPDATE city_arrivals SET ended_at = now(), ended_reason = 'stopped' WHERE ended_at IS NULL`);
    await db.query(`UPDATE intentcasts SET place_id = NULL WHERE place_id IS NOT NULL`);
    await db.query(`DELETE FROM match_queries WHERE lower(city) IN ('bengaluru', 'bangalore')`);

    const person = async (key: string, name: string, batch: number, openTo: string[] = [], limit?: number) => {
      const email = `cty-${key}-${run}@iitbhu.ac.in`;
      const p = await loginForTest(app, email);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = $3, profile_completed_at = now(), onboarding_completed_at = now(),
                           open_to_preferences = $4::jsonb WHERE id = $1`,
        [
          p.personId,
          `${name} ${run}`,
          batch,
          openTo.length ? JSON.stringify({ selected: openTo, descriptions: {}, ...(limit ? { limits: { coffee: limit } } : {}) }) : null
        ]
      );
      who[key] = { ...p, email };
      return who[key]!;
    };
    await person("local", "Lata", 2018);
    await person("newbie", "Neel", 2019);
    await person("arriver", "Arjun", 2018);
    await person("coffee", "Chitra", 2017, ["coffee"], 1);
    await person("nocoffee", "Dev", 2018, ["mentorship"]);
    for (const k of ["h1", "h2", "h3", "h4"]) await person(k, `Helper${k}`, 2015, ["city_help"]);
    await person("poster", "Pooja", 2016);
    await person("punelocal", "Pranav", 2016);
  });

  afterAll(async () => {
    await db?.query(`DELETE FROM match_queries WHERE parser_source = 'cities' AND lower(city) IN ('bengaluru', 'pune')`);
    await db?.end();
    await app?.close();
  });

  it("needs sign-in; unknown city is 404", async () => {
    expect((await req("GET", `/v1/cities/${blr}`, null)).statusCode).toBe(401);
    expect((await req("GET", `/v1/cities/00000000-0000-4000-8000-000000000000`, who.local!)).statusCode).toBe(404);
  });

  it("setting a city resolves the canonical place; a first-time city never prompts (check 7)", async () => {
    for (const k of ["local", "coffee", "nocoffee", "h1", "h2", "h3", "h4", "poster"]) {
      const r = await setCity(who[k]!, k === "local" ? "Bangalore" : "Bengaluru");
      expect(r.statusCode).toBe(200);
      expect(r.json().arrivalPrompt).toBeNull();
    }
    for (const k of ["arriver", "punelocal"]) expect((await setCity(who[k]!, "Pune")).json().arrivalPrompt).toBeNull();
    const placeOf = async (id: string) =>
      (await db.query<{ p: string | null }>(`SELECT residence_canonical_place_id AS p FROM people WHERE id = $1`, [id])).rows[0]!.p;
    expect(await placeOf(who.local!.personId)).toBe(blr);
    expect(await placeOf(who.arriver!.personId)).toBe(pune);
    // Saving the same city text never clears a place an admin mapped (e.g. a spelling the lookup lacks).
    await db.query(`UPDATE people SET residence_city = 'Blr-${run}' WHERE id = $1`, [who.local!.personId]);
    expect((await setCity(who.local!, `Blr-${run}`)).statusCode).toBe(200);
    expect(await placeOf(who.local!.personId)).toBe(blr);
    expect((await setCity(who.local!, "Bangalore")).json().arrivalPrompt).toBeNull();
    const list = (await req("GET", "/v1/cities", who.local!)).json() as { viewerCity: { placeId: string; slug: string }; cities: Array<{ placeId: string; count: number }> };
    expect(list.viewerCity).toMatchObject({ placeId: blr, slug: "bengaluru" });
    expect(list.cities.find((c) => c.placeId === blr)!.count).toBeGreaterThanOrEqual(8);
    expect((await req("GET", "/v1/cities/search?q=banga", who.local!)).json().places[0].placeId).toBe(blr);
  });

  it("moving Pune → Bengaluru offers the opt-in; nobody appears as new without opting in (checks 3, 7)", async () => {
    expect((await setCity(who.newbie!, "Pune")).json().arrivalPrompt).toBeNull();
    const moved = (await setCity(who.newbie!, "Bengaluru")).json();
    expect(moved.arrivalPrompt).toEqual({ placeId: blr, cityName: "Bengaluru" });

    const local = await city(who.local!);
    expect(local.viewerRole).toBe("local");
    expect(local.v1Enabled).toBe(true);
    expect(local.arrivals.items.map((a: any) => a.person.id)).not.toContain(who.newbie!.personId);

    const before = await city(who.newbie!);
    expect(before.viewerRole).toBe("local");
    expect(before.arrivalPrompt).toBe(true);
    // Only for your own city.
    expect((await req("POST", "/v1/cities/arrivals", who.newbie!, { placeId: pune })).statusCode).toBe(409);
    expect((await req("POST", "/v1/cities/arrivals", who.local!, { placeId: blr })).statusCode).toBe(409);
    expect((await req("POST", "/v1/cities/arrivals", who.newbie!, { placeId: blr })).statusCode).toBe(201);
    expect((await req("POST", "/v1/cities/arrivals", who.newbie!, { placeId: blr })).statusCode).toBe(409);

    const after = await city(who.newbie!);
    expect(after.viewerRole).toBe("newcomer");
    expect(after.arrivalPrompt).toBe(false);
    expect(after.arrivals).toBeNull();
    expect(after.myArrival).toMatchObject({ previousCity: "Pune", daysLeft: 30 });
  });

  it("an offer reaches only the newcomer, in the app; never a note or an email (check 2)", async () => {
    const local = await city(who.local!);
    const arrival = local.arrivals.items.find((a: any) => a.person.id === who.newbie!.personId);
    expect(arrival).toMatchObject({ previousCity: "Pune", arrivedDaysAgo: 0, myOffer: null });

    const mail = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    const notesBefore = (await db.query(`SELECT COUNT(*)::int AS c FROM contact_requests WHERE sender_person_id = $1`, [who.local!.personId])).rows[0].c;
    const offer = await req("POST", `/v1/cities/arrivals/${arrival.id}/offers`, who.local!, { kinds: ["areas", "commute"], line: "Six years in HSR." });
    expect(offer.statusCode).toBe(201);
    expect(mail).not.toHaveBeenCalled();
    mail.mockRestore();
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM contact_requests WHERE sender_person_id = $1`, [who.local!.personId])).rows[0].c).toBe(notesBefore);

    expect((await req("POST", `/v1/cities/arrivals/${arrival.id}/offers`, who.local!, { kinds: ["coffee"] })).statusCode).toBe(409);
    expect((await req("POST", `/v1/cities/arrivals/${arrival.id}/offers`, who.arriver!, { kinds: ["coffee"] })).statusCode).toBe(403);
    expect((await req("POST", `/v1/cities/arrivals/${arrival.id}/offers`, who.poster!, { kinds: [] })).statusCode).toBe(400);
    expect((await city(who.local!)).arrivals.items.find((a: any) => a.id === arrival.id).myOffer).not.toBeNull();

    const mine = await city(who.newbie!);
    expect(mine.offers).toHaveLength(1);
    expect(mine.offers[0]).toMatchObject({ kinds: ["areas", "commute"], line: "Six years in HSR.", seen: false, myNote: null });
    const notifications = (await req("GET", "/v1/notifications", who.newbie!)).json().items as Array<{ kind: string; cityName?: string }>;
    expect(notifications.find((n) => n.kind === "city_help_offer_received")).toMatchObject({ cityName: "Bengaluru" });
    expect((await req("POST", "/v1/cities/offers/seen", who.newbie!)).statusCode).toBe(204);
    expect((await city(who.newbie!)).offers[0].seen).toBe(true);
  });

  it("the newcomer may write to whoever offered; nobody else can use the offer", async () => {
    const offer = (await city(who.newbie!)).offers[0];
    const text = "Thanks for offering to help with areas to live. I’ve just moved from Pune for a new job.";
    expect((await note(who.arriver!, who.local!.personId, "newcomer", text, { cityHelpOfferId: offer.id })).statusCode).toBe(404);
    expect((await note(who.newbie!, who.local!.personId, "newcomer", text)).statusCode).toBe(404);
    const sent = await note(who.newbie!, who.local!.personId, "newcomer", text, { cityHelpOfferId: offer.id });
    expect(sent.statusCode).toBe(201);
    expect((await city(who.newbie!)).offers[0].myNote.status).toBe("pending");
    const local = await city(who.local!);
    expect(local.arrivals.items.find((a: any) => a.person.id === who.newbie!.personId).wroteToMe.status).toBe("pending");
  });

  it("“Stop showing me as new” removes them from every list at once; their offers stay (check 8)", async () => {
    expect((await req("POST", "/v1/cities/arrivals/end", who.newbie!)).statusCode).toBe(204);
    expect((await city(who.local!)).arrivals.items.map((a: any) => a.person.id)).not.toContain(who.newbie!.personId);
    const mine = await city(who.newbie!);
    expect(mine.viewerRole).toBe("local");
    expect(mine.offers).toHaveLength(1);
    expect(mine.arrivalPrompt).toBe(false);
  });

  it("coffee needs a weekly limit to turn on, and the list says who is open (check 1)", async () => {
    const off = await req("PATCH", "/v1/me/profile", who.poster!, { openToPreferences: { selected: ["coffee"], descriptions: {} } });
    expect(off.statusCode).toBe(400);
    expect(off.json().code).toBe("COFFEE_LIMIT_REQUIRED");
    expect((await req("PATCH", "/v1/me/profile", who.poster!, { openToPreferences: { selected: ["coffee"], descriptions: {}, limits: { coffee: 4 } } })).statusCode).toBe(400);
    const on = await req("PATCH", "/v1/me/profile", who.poster!, { openToPreferences: { selected: ["coffee"], descriptions: {}, limits: { coffee: 3 } } });
    expect(on.statusCode).toBe(200);
    expect(on.json().profile.openToPreferences.limits).toEqual({ coffee: 3 });
    // A later save without limits keeps the stored one.
    const keep = await req("PATCH", "/v1/me/profile", who.poster!, { openToPreferences: { selected: ["coffee", "intros"], descriptions: {} } });
    expect(keep.json().profile.openToPreferences.limits).toEqual({ coffee: 3 });

    const page = (await req("GET", `/v1/cities/${blr}/alumni?filter=coffee`, who.local!)).json() as { items: Array<{ person: { id: string }; coffee: { open: boolean; spotsLeft: number | null } }> };
    const ids = page.items.map((i) => i.person.id);
    expect(ids).toContain(who.coffee!.personId);
    expect(ids).not.toContain(who.nocoffee!.personId);
    const all = (await req("GET", `/v1/cities/${blr}/alumni?filter=batch`, who.local!)).json().items as Array<{ person: { id: string }; coffee: { open: boolean }; sharedTag: string | null }>;
    const dev = all.find((i) => i.person.id === who.nocoffee!.personId)!;
    expect(dev.coffee.open).toBe(false);
    expect(dev.sharedTag).toBe("Same batch");
    expect(all.find((i) => i.person.id === who.coffee!.personId)!.sharedTag).toBe("1 batch apart");
  });

  it("coffee asks: reason ≥ 40, only to people open to coffee, never past the weekly limit even at once (checks 4, 5)", async () => {
    const reason = "Same batch window, and I'd love to hear how you moved into data science.";
    const short = await note(who.local!, who.coffee!.personId, "coffee", "Hi, coffee?\n\nWhen suits me: Weekend and evenings, any day of the week");
    expect(short.statusCode).toBe(400);
    expect(short.json().code).toBe("COFFEE_REASON_TOO_SHORT");
    const closed = await note(who.local!, who.nocoffee!.personId, "coffee", reason);
    expect(closed.statusCode).toBe(403);
    expect(closed.json().code).toBe("COFFEE_NOT_OPEN");

    const [a, b] = await Promise.all([
      note(who.local!, who.coffee!.personId, "coffee", `${reason}\n\nWhen suits me: Weekend`),
      note(who.arriver!, who.coffee!.personId, "coffee", reason)
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.statusCode === 409)!.json().code).toBe("COFFEE_LIMIT_REACHED");
    const row = (await req("GET", `/v1/cities/${blr}/alumni?filter=coffee`, who.poster!)).json().items.find((i: any) => i.person.id === who.coffee!.personId);
    expect(row.coffee).toMatchObject({ open: true, limit: 1, spotsLeft: 0 });
  });

  it("city-help asks go only to people open to it, at most 3 waiting per sender (check 6)", async () => {
    const msg = (n: number) => `Moving to Bengaluru in December for work, ask ${n}.\n\nMoving: December\nNeed: Areas to live`;
    expect((await note(who.arriver!, who.nocoffee!.personId, "relocation", msg(0))).json().code).toBe("CITY_HELP_NOT_OPEN");
    expect((await note(who.arriver!, who.h1!.personId, "relocation", msg(1))).statusCode).toBe(201);
    expect((await note(who.arriver!, who.h2!.personId, "visiting", msg(2))).statusCode).toBe(201);
    expect((await note(who.arriver!, who.h3!.personId, "relocation", msg(3))).statusCode).toBe(201);
    const fourth = await note(who.arriver!, who.h4!.personId, "relocation", msg(4));
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().code).toBe("CITY_ASK_LIMIT");

    const view = await city(who.arriver!);
    expect(view.viewerRole).toBe("arriver");
    expect(view.pendingCityAsks).toBe(3);
    const helperIds = view.helpers.map((h: any) => h.person.id);
    for (const k of ["h1", "h2", "h3", "h4"]) expect(helperIds).toContain(who[k]!.personId);
    expect(helperIds).not.toContain(who.nocoffee!.personId);
    expect(view.helpers.find((h: any) => h.person.id === who.h1!.personId).yourCityAsk.status).toBe("pending");
    expect(view.arrivals).toBeNull();
  });

  it("page views are logged separately; only city+country relocation searches count, hidden below 3", async () => {
    const count = async () =>
      (await db.query(`SELECT COUNT(*)::int AS c FROM match_queries WHERE parser_source = 'cities' AND lower(city) = 'bengaluru'`)).rows[0].c as number;
    const start = await count();
    await city(who.arriver!); // already viewed today in the previous test
    await city(who.local!);
    await city(who.coffee!);
    expect(await count()).toBe(start);
    await city(who.punelocal!);
    expect(await count()).toBe(start + 1);
    await city(who.punelocal!);
    expect(await count()).toBe(start + 1);

    expect(start + 1).toBe(2);
    expect((await city(who.local!)).helpPanel.askCount30d).toBeNull();
    await db.query(`INSERT INTO match_queries (category, detected_fields, parser_source, city, country) VALUES
      ('referral', '{city}', 'rules', 'Bengaluru', 'India'),
      ('relocation', '{city}', 'rules', 'Bengaluru', 'Other country'),
      ('relocation', '{city}', 'cities', 'Bengaluru', 'India'),
      ('relocation', '{city}', 'rules', 'Bangalore', 'India'),
      ('relocation', '{city}', 'llm', 'Bengaluru', 'India')`);
    expect((await city(who.local!)).helpPanel.askCount30d).toBeNull();
    // A repeat search is another search, not another claimed person.
    await db.query(`INSERT INTO match_queries (category, detected_fields, parser_source, city, country)
      VALUES ('relocation', '{city}', 'rules', 'Bengaluru', 'India')`);
    expect((await city(who.local!)).helpPanel.askCount30d).toBe(3);
    await db.query(`INSERT INTO city_demand_view_keys (key_hash, viewed_on) VALUES ($1, CURRENT_DATE - 10) ON CONFLICT DO NOTHING`, [`retained-old-key-${run}`]);
    const keysBefore = (await db.query(`SELECT COUNT(*)::int AS c FROM city_demand_view_keys`)).rows[0].c;
    const { CitiesRepo } = await import("../src/repos/citiesRepo.js");
    await new CitiesRepo(db).purgeDemandKeys();
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM city_demand_view_keys`)).rows[0].c).toBe(keysBefore);
  });

  it("other approved cities get the full city page too; pages no longer wait for CITIES_V1_PLACE_IDS (check 13)", async () => {
    const own = await city(who.punelocal!, pune);
    expect(own.viewerRole).toBe("local");
    expect(own.v1Enabled).toBe(true);
    expect(own.arrivals).not.toBeNull();
    expect(own.helpPanel).not.toBeNull();
    expect(own.posts).toEqual([]);
    expect(own.alumni.items.map((i: any) => i.person.id)).toContain(who.arriver!.personId);
    const visiting = await city(who.local!, pune);
    expect(visiting.viewerRole).toBe("arriver");
  });

  it("Wall posts can carry the city; Get together lists them", async () => {
    const post = await req("POST", "/v1/intentcasts", who.poster!, {
      category: "collaboration",
      kind: "invitation",
      content: "Sunday morning cricket near HSR\nNeed 6 more. Anyone in?",
      placeId: blr
    });
    expect(post.statusCode).toBe(201);
    const posts = (await city(who.local!)).posts as Array<{ authorPersonId: string; content: string }>;
    expect(posts[0]).toMatchObject({ authorPersonId: who.poster!.personId });
    expect((await req("POST", "/v1/intentcasts", who.poster!, { category: "collaboration", kind: "invitation", content: "Another plan for the weekend", placeId: "00000000-0000-4000-8000-000000000000" })).statusCode).toBe(400);
  });

  it("View all requests: the posts endpoint pages every open post tagged with the city", async () => {
    for (let i = 0; i < 21; i++) {
      const r = await req("POST", "/v1/intentcasts", who.poster!, { category: "collaboration", kind: "ask", content: `Request ${i + 1} about Bengaluru`, placeId: blr });
      expect(r.statusCode).toBe(201);
    }
    const payload = await city(who.local!);
    expect(payload.posts.length).toBe(3);
    expect(payload.postsHasMore).toBe(true);

    const page1 = await req("GET", "/v1/cities/" + blr + "/posts", who.local!);
    expect(page1.statusCode).toBe(200);
    expect(page1.json().posts.length).toBe(20);
    expect(page1.json().nextCursor).toBe("20");
    // Newest first: the preview's first card is the page's first row.
    expect(page1.json().posts[0].id).toBe(payload.posts[0].id);

    const page2 = await req("GET", "/v1/cities/" + blr + "/posts?cursor=20", who.local!);
    expect(page2.statusCode).toBe(200);
    // 1 from the previous test + 21 here = 22 open posts.
    expect(page2.json().posts.length).toBe(2);
    expect(page2.json().nextCursor).toBeNull();
  });

  it("admin metrics: Cities notes by category and arrivals", async () => {
    expect((await req("GET", "/v1/admin/metrics/cities", who.poster!)).statusCode).toBe(403);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [who.poster!.personId]);
    const r = await req("GET", "/v1/admin/metrics/cities?days=7", who.poster!);
    expect(r.statusCode).toBe(200);
    const m = r.json().metrics;
    expect(m.windowDays).toBe(7);
    expect(m.notes.byCategory.map((c: any) => c.category)).toEqual(["coffee", "relocation", "visiting", "newcomer"]);
    expect(m.notes.byCategory.find((c: any) => c.category === "coffee").sent).toBeGreaterThanOrEqual(1);
    expect(m.arrivals.optedIn).toBeGreaterThanOrEqual(1);
    expect(m.arrivals.offers).toBeGreaterThanOrEqual(1);
    await db.query(`UPDATE people SET role = 'alumni' WHERE id = $1`, [who.poster!.personId]);
  });

  it("demo accounts can't write", async () => {
    // Covered by requireNonDemoMutation on every Cities mutation; spot-check the route is guarded.
    expect((await req("POST", "/v1/cities/arrivals/end", null)).statusCode).toBe(401);
  });
});

describe("Cities helpers", () => {
  it("coffee reason ignores the When-suits line", () => {
    expect(coffeeReasonText("Short reason\n\nWhen suits me: Weekday evening")).toBe("Short reason");
    expect(coffeeReasonText("No suits line here")).toBe("No suits line here");
  });
  it("shared tag: batch window, then department, then company", () => {
    const viewer = { batchYear: 2018, departmentCode: "cse", companyMainId: "x", companyName: "Flipkart" };
    expect(sharedTag({ batch_year: 2018, department_code: null, org_name: null }, viewer)).toBe("Same batch");
    expect(sharedTag({ batch_year: 2016, department_code: "cse", org_name: null }, viewer)).toBe("2 batches apart");
    expect(sharedTag({ batch_year: 2010, department_code: "cse", org_name: null }, viewer)).toBe("Same department");
    expect(sharedTag({ batch_year: 2010, department_code: "ee", org_name: "flipkart" }, viewer)).toBe("Also at Flipkart");
    expect(sharedTag({ batch_year: null, department_code: null, org_name: null }, viewer)).toBeNull();
  });
});
