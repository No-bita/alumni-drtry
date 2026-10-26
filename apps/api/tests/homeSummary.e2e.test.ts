import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { HomeSummaryService, HOME_SUMMARY_CACHE_MS } from "../src/services/homeSummaryService.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Counts = { alumni: number; companies: number; openToReferrals: number };

const run = Date.now();

describe("GET /v1/home/summary (integration)", () => {
  let app: App;
  let db: Pool;
  let before: { cookie: string; personId: string };
  let after: { cookie: string; personId: string };
  let baseline: Counts;

  const get = async (cookie: string) => {
    const res = await app.inject({ method: "GET", url: "/v1/home/summary", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return res.json() as Counts;
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    // Both viewers exist before the baseline, and are created the same way, so they cancel out.
    before = await loginForTest(app, `home-before-${run}@iitbhu.ac.in`);
    after = await loginForTest(app, `home-after-${run}@iitbhu.ac.in`);
    baseline = await get(before.cookie);

    const typeId = async (code: string) =>
      (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = $1`, [code])).rows[0]!.id;
    const ft = await typeId("full_time_employment");
    const study = await typeId("higher_education_non_research");
    const org = async (name: string) =>
      (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [name])).rows[0]!.id;
    const orgA = await org(`Hsumorg A ${run}`);
    const orgB = await org(`Hsumorg B ${run}`);
    const pastOrg = await org(`Hsumorg Past ${run}`);
    const school = await org(`Hsumorg School ${run}`);
    const suspendedOrg = await org(`Hsumorg Suspended ${run}`);

    const person = async (key: string, opts: { openTo?: string[]; completed?: boolean; suspended?: boolean } = {}) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO people (institutional_email, full_name, batch_year, profile_completed_at, suspended_at, open_to_preferences)
           VALUES ($1, $2, 2019, $3, $4, $5::jsonb) RETURNING id`,
          [
            `home-${key}-${run}@iitbhu.ac.in`,
            `Home ${key} ${run}`,
            opts.completed === false ? null : new Date(),
            opts.suspended ? new Date() : null,
            opts.openTo ? JSON.stringify({ selected: opts.openTo, descriptions: {} }) : null
          ]
        )
      ).rows[0]!.id;
    const job = (personId: string, type: string, organizationId: string, current: boolean) =>
      db.query(
        `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current, end_date)
         VALUES ($1, $2, $3, 'Engineer', $4, $5)`,
        [personId, type, organizationId, current, current ? null : "2022-01-01"]
      );

    // Counted: 3 people, 2 current employers (A twice, B once), 1 open to referrals.
    await job(await person("refA", { openTo: ["referrals", "coffee"] }), ft, orgA, true);
    await job(await person("coffeeA", { openTo: ["coffee"] }), ft, orgA, true);
    const student = await person("studyB");
    await job(student, ft, orgB, true);
    await job(student, study, school, true); // a current study programme is not a company
    await job(await person("pastOnly"), ft, pastOrg, false); // counted as a person, past employer is not
    // Not counted at all.
    await job(await person("suspended", { suspended: true, openTo: ["referrals"] }), ft, suspendedOrg, true);
    await job(await person("incomplete", { completed: false, openTo: ["referrals"] }), ft, suspendedOrg, true);
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it("counts only people Match can return, current employers, and referrals", async () => {
    const now = await get(after.cookie);
    expect(now.alumni - baseline.alumni).toBe(4);
    expect(now.companies - baseline.companies).toBe(2);
    expect(now.openToReferrals - baseline.openToReferrals).toBe(1);
  });

  it("serves the cached numbers to the same viewer within 10 minutes", async () => {
    expect(await get(before.cookie)).toEqual(baseline);
  });

  it("needs a session", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/home/summary" });
    expect(res.statusCode).toBe(401);
  });
});

describe("HomeSummaryService cache", () => {
  it("refetches after 10 minutes and keys by viewer", async () => {
    let t = 1_000;
    let calls = 0;
    const db = {
      query: async () => {
        calls += 1;
        return { rows: [{ alumni: String(calls), companies: "0", open_to_referrals: "0" }] };
      }
    };
    const service = new HomeSummaryService(db as never, () => t);
    expect((await service.summary("a", false)).alumni).toBe(1);
    expect((await service.summary("a", false)).alumni).toBe(1);
    expect((await service.summary("b", false)).alumni).toBe(2);
    t += HOME_SUMMARY_CACHE_MS;
    expect((await service.summary("a", false)).alumni).toBe(3);
  });
});
