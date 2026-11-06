import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { adviceNote, referralNote } from "./helpers/note.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
const MAIN = `Zylo${run} Technologies`;
const ALIAS = `Zylo${run} Tech`;
const OTHER = `Otherco${run}`;
const PAGECO = `Pageco${run}`;

type CompanyResponse = {
  company: string;
  current: Array<{ id: string; fullName: string; openToReferrals: boolean; organizationName: string; yourNote: string | null; roleTitle: string }>;
  past: Array<{ id: string; fullName: string }>;
  pageInfo: { nextCursor: string | null };
};

describe("Careers API (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let viewer: Who;
  const people: Record<string, Who> = {};

  const get = (url: string, who?: Who) => app.inject({ method: "GET", url, headers: who ? { cookie: who.cookie } : {} });
  const company = async (name: string, role?: string) =>
    (await get(`/v1/careers/company?name=${encodeURIComponent(name)}${role ? `&role=${encodeURIComponent(role)}` : ""}`, viewer)).json() as CompanyResponse;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    viewer = await loginForTest(app, `car-viewer-${run}@iitbhu.ac.in`);
    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const org = async (name: string, canonical: string | null = null) =>
      (await db.query<{ id: string }>(
        `INSERT INTO organizations (name, approval_status, canonical_organization_id) VALUES ($1, 'approved', $2) RETURNING id`,
        [name, canonical],
      )).rows[0]!.id;
    const main = await org(MAIN);
    const alias = await org(ALIAS, main);
    const other = await org(OTHER);
    const person = async (key: string, name: string, batch: number, openTo: string[], test = false) => {
      const p = await loginForTest(app, `car-${key}-${run}@iitbhu.ac.in`);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = $3, profile_completed_at = now(), onboarding_completed_at = now(),
                           open_to_preferences = $4::jsonb, is_test_user = $5 WHERE id = $1`,
        [p.personId, `${name} ${run}`, batch, JSON.stringify({ selected: openTo, descriptions: {} }), test],
      );
      people[key] = p;
      return p.personId;
    };
    const job = (personId: string, orgId: string, role: string, current: boolean) =>
      db.query(`INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, $4, $5)`, [
        personId, ft, orgId, role, current,
      ]);

    await job(await person("a", "Asha", 2019, ["referrals", "mentorship"]), main, "Product Manager", true);
    await job(await person("b", "Bilal", 2022, ["coffee"]), alias, "Software Engineer", true); // linked name, not open
    await job(await person("e", "Esha", 2021, ["referrals"]), alias, "Data Scientist", true); // linked name, open
    const c = await person("c", "Chirag", 2017, ["referrals"]);
    await job(c, main, "Analyst", false);
    await job(c, other, "Manager", true);
    await job(viewer.personId, main, "Intern", true); // the viewer: never listed
    await db.query(`UPDATE people SET full_name = 'Viewer', profile_completed_at = now() WHERE id = $1`, [viewer.personId]);
  });

  afterAll(async () => {
    await db?.query(`DELETE FROM match_queries WHERE company = ANY($1::text[])`, [[MAIN, OTHER, PAGECO]]);
    await db?.end();
    await app?.close();
  });

  it("needs sign-in and a real company name", async () => {
    expect((await get(`/v1/careers/company?name=${encodeURIComponent(MAIN)}`)).statusCode).toBe(401);
    expect((await get("/v1/careers/company?name=x", viewer)).statusCode).toBe(400);
    expect((await get("/v1/careers/referral-companies")).statusCode).toBe(401);
  });

  // Test and demo profiles follow the same rule as Ask (shown only outside production), so they aren't asserted here.
  it("company screen: people there now (open to referrals first, linked names included) and before; never you", async () => {
    const r = await company(MAIN.toLowerCase());
    expect(r.company).toBe(MAIN);
    const names = r.current.map((p) => p.fullName);
    expect(names.slice(0, 2).sort()).toEqual([`Asha ${run}`, `Esha ${run}`]);
    expect(names[2]).toBe(`Bilal ${run}`);
    expect(r.current.find((p) => p.fullName === `Esha ${run}`)!.organizationName).toBe(ALIAS);
    expect(r.past.map((p) => p.fullName)).toEqual([`Chirag ${run}`]);
    expect(r.current.some((p) => p.id === viewer.personId)).toBe(false);
  });

  it("asking by the linked name finds only that name's people (same as Ask)", async () => {
    const r = await company(ALIAS);
    expect(r.current.map((p) => p.fullName).sort()).toEqual([`Bilal ${run}`, `Esha ${run}`]);
  });

  it("a lookup counts as demand, marked careers; your note status shows on the person", async () => {
    await company(MAIN, "Product manager");
    const logged = await db.query<{ parser_source: string; category: string; role: string }>(
      `SELECT parser_source, category, role FROM match_queries WHERE company = $1 AND role = 'Product manager'`,
      [MAIN],
    );
    expect(logged.rows[0]).toEqual({ parser_source: "careers", category: "referral", role: "Product manager" });

    const res = await app.inject({
      method: "POST",
      url: "/v1/contact-requests",
      headers: { cookie: viewer.cookie },
      payload: {
        recipientPersonId: people.a!.personId,
        note: referralNote({ role: "PM", company: MAIN }),
        source: "careers",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((await db.query<{ source: string }>(`SELECT source FROM contact_requests WHERE sender_person_id = $1`, [viewer.personId])).rows[0]!.source).toBe("careers");
    const r = await company(MAIN);
    expect(r.current.find((p) => p.id === people.a!.personId)!.yourNote).toBe("pending");
  });

  it("companies you can get referred to: open alumni working there now, counted under the main company", async () => {
    const r = (await get("/v1/careers/referral-companies", viewer)).json() as { companies: Array<{ company: string; alumni: number }> };
    expect(r.companies.find((c) => c.company === MAIN)).toEqual({ company: MAIN, alumni: 2 }); // Asha + Esha (linked name)
    expect(r.companies.find((c) => c.company === OTHER)).toEqual({ company: OTHER, alumni: 1 }); // Chirag works there now
    expect(r.companies.some((c) => c.company === ALIAS)).toBe(false);
  });

  it("people asked about your company: lookups and Ask questions naming it in 30 days, for its own staff", async () => {
    const before = ((await get("/v1/careers/my-company-demand", people.e)).json() as { demand: { company: string; asks: number; days: number } }).demand;
    expect(before.company).toBe(MAIN); // Esha's job is under the linked name; demand is for the main company
    await company(MAIN);
    await db.query(`INSERT INTO match_queries (category, company, parser_source) VALUES ('referral', $1, 'rules')`, [ALIAS.toLowerCase()]);
    const after = ((await get("/v1/careers/my-company-demand", people.e)).json() as { demand: { asks: number; days: number } }).demand;
    expect(after.asks - before.asks).toBe(2);
    expect(after.days).toBe(30);
    await db.query(`DELETE FROM match_queries WHERE company = $1`, [ALIAS.toLowerCase()]);
  });

  it("no current company: no demand line", async () => {
    const someone = await loginForTest(app, `car-nojob-${run}@iitbhu.ac.in`);
    expect(((await get("/v1/careers/my-company-demand", someone)).json() as { demand: unknown }).demand).toBeNull();
  });

  it("pages people 50 at a time with a consistent cursor, and only the first page counts as demand", async () => {
    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const orgId = (await db.query<{ id: string }>(
      `INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [PAGECO],
    )).rows[0]!.id;
    // Direct SQL seeds: 60 real sign-ins would exhaust the suite-wide per-IP auth budget.
    await db.query(
      `INSERT INTO people (institutional_email, full_name, batch_year, profile_completed_at, onboarding_completed_at)
       SELECT $1 || i::text || $2, $3 || lpad(i::text, 3, '0') || $4, 2020, now(), now()
       FROM generate_series(1, 60) AS i`,
      [`car-page-`, `-${run}@iitbhu.ac.in`, `Pager `, ` ${run}`],
    );
    await db.query(
      `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current)
       SELECT p.id, $1, $2, 'Pager', true FROM people p WHERE p.institutional_email LIKE $3`,
      [ft, orgId, `car-page-%-${run}@iitbhu.ac.in`],
    );

    const page1 = (await get(`/v1/careers/company?name=${encodeURIComponent(PAGECO)}`, viewer)).json() as CompanyResponse;
    const page1Ids = [...page1.current, ...page1.past].map((r) => r.id);
    expect(page1Ids.length).toBe(50);
    expect(page1.pageInfo.nextCursor).toBe("50");

    const page2 = (await get(`/v1/careers/company?name=${encodeURIComponent(PAGECO)}&cursor=50`, viewer)).json() as CompanyResponse;
    const page2Ids = [...page2.current, ...page2.past].map((r) => r.id);
    expect(page2Ids.length).toBe(10);
    expect(page2.pageInfo.nextCursor).toBeNull();
    expect(page1Ids.filter((id) => page2Ids.includes(id))).toEqual([]);

    // Demand: the lookup is counted once (first page); loading page 2 does not add another.
    const demand = await db.query<{ n: string }>(`SELECT count(*) AS n FROM match_queries WHERE company = $1 AND parser_source = 'careers'`, [PAGECO]);
    expect(Number(demand.rows[0]!.n)).toBe(1);

    const bad = await get(`/v1/careers/company?name=${encodeURIComponent(PAGECO)}&cursor=abc`, viewer);
    expect(bad.statusCode).toBe(400);
    expect((bad.json() as { code: string }).code).toBe("CAREERS_BAD_REQUEST");
  });
});
