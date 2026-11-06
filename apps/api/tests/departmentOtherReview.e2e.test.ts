import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();

/**
 * Member-typed "Other" departments go through admin review before anything is public:
 * pending/rejected text and the generic Other label never leave the owner's own view.
 * Every step is recorded in the append-only department_other_history.
 */
describe("department Other review (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  let stranger: Who;

  const req = (method: "GET" | "POST" | "PATCH", url: string, w: Who | null, payload?: unknown) =>
    app.inject({ method, url, headers: w ? { cookie: w.cookie } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const state = async (personId: string) =>
    (await db.query<{
      department_id: string | null;
      department_other_text: string | null;
      department_other_status: string;
      department_other_rejection_reason: string | null;
    }>(
      `SELECT department_id, department_other_text, department_other_status, department_other_rejection_reason FROM people WHERE id = $1`,
      [personId]
    )).rows[0]!;
  const history = async (personId: string) =>
    (await db.query<{ action: string; actor_person_id: string | null; submitted_text: string | null; target_department_id: string | null; reason: string | null }>(
      `SELECT action, actor_person_id, submitted_text, target_department_id, reason FROM department_other_history WHERE person_id = $1 ORDER BY created_at, id`,
      [personId]
    )).rows;
  const publicBundle = async (viewer: Who | null, profileId = member.personId) => {
    const r = await req("GET", `/v1/profiles/${profileId}`, viewer);
    expect(r.statusCode).toBe(200);
    return (r.json() as { profile: Record<string, any> }).profile;
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string) => {
      const p = await loginForTest(app, `dor-${key}-${run}@iitbhu.ac.in`);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = 2019, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
        [p.personId, `DOR ${key} ${run}`]
      );
      return p;
    };
    admin = await person("admin");
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    member = await person("member");
    // Department choice is frozen after onboarding, so seed it directly: the member picked
    // "Other" during onboarding and now types (and edits) their specification via the API.
    await db.query(
      `UPDATE people SET department_id = (SELECT id FROM departments WHERE code = 'other') WHERE id = $1`,
      [member.personId]
    );
    stranger = await person("stranger");
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("a typed Other department starts pending, hidden publicly, and logged", async () => {
    const patch = await req("PATCH", "/v1/me/profile", member, { departmentOtherText: "Astrophysics" });
    expect(patch.statusCode).toBe(200);
    const body = patch.json() as { profile: Record<string, any> };
    expect(body.profile.departmentOtherText).toBe("Astrophysics");
    expect(body.profile.departmentOtherStatus).toBe("pending");

    const row = await state(member.personId);
    expect(row.department_other_status).toBe("pending");
    expect((await history(member.personId)).map((h) => h.action)).toEqual(["submitted"]);

    // Owner sees their own text and review state.
    const own = await publicBundle(member);
    expect(own.departmentCode).toBe("other");
    expect(own.departmentOtherText).toBe("Astrophysics");
    expect(own.departmentOtherStatus).toBe("pending");

    // Everyone else sees no code, no name, no text, no status.
    const pub = await publicBundle(stranger);
    expect(pub.departmentCode).toBeNull();
    expect(pub.departmentName).toBeNull();
    expect(pub.departmentOtherText).toBeNull();
    expect(pub.departmentOtherStatus).toBeNull();
  });

  it("directory search rows never carry an Other department label", async () => {
    const r = await req("GET", `/v1/search?q=DOR%20member%20${run}`, stranger);
    expect(r.statusCode).toBe(200);
    const results = (r.json() as { results: Array<Record<string, any>> }).results;
    const row = results.find((x) => x.id === member.personId);
    expect(row).toBeTruthy();
    expect(row!.departmentCode).toBeNull();
    expect(row!.departmentName).toBeNull();
  });

  it("the queue lists the submission and approval publishes the typed text", async () => {
    const queue = await req("GET", `/v1/admin/department-other/review?status=pending&q=${run}`, admin);
    expect(queue.statusCode).toBe(200);
    const subs = (queue.json() as { submissions: Array<Record<string, any>> }).submissions;
    expect(subs.some((s) => s.person_id === member.personId && s.department_other_text === "Astrophysics")).toBe(true);

    // Members cannot reach the admin endpoints.
    expect((await req("GET", "/v1/admin/department-other/review", member)).statusCode).toBe(403);

    const approve = await req("POST", `/v1/admin/department-other/${member.personId}/approve`, admin, { expectedText: "Astrophysics" });
    expect(approve.statusCode).toBe(204);
    expect((await state(member.personId)).department_other_status).toBe("approved");
    expect((await history(member.personId)).map((h) => h.action)).toEqual(["submitted", "approved"]);

    const pub = await publicBundle(stranger);
    expect(pub.departmentCode).toBeNull(); // the Other label itself never shows
    expect(pub.departmentName).toBeNull();
    expect(pub.departmentOtherText).toBe("Astrophysics");
  });

  it("editing the text resubmits it and hides it again until re-approved", async () => {
    const patch = await req("PATCH", "/v1/me/profile", member, { departmentOtherText: "Applied Astrophysics" });
    expect(patch.statusCode).toBe(200);
    expect((await state(member.personId)).department_other_status).toBe("pending");

    const pub = await publicBundle(stranger);
    expect(pub.departmentOtherText).toBeNull();
    const own = await publicBundle(member);
    expect(own.departmentOtherText).toBe("Applied Astrophysics");
    expect(own.departmentOtherStatus).toBe("pending");

    expect((await history(member.personId)).map((h) => h.action)).toEqual(["submitted", "approved", "submitted"]);
  });

  it("approval needs the exact reviewed text: missing or stale text is refused and nothing is written", async () => {
    const url = `/v1/admin/department-other/${member.personId}/approve`;
    await req("PATCH", "/v1/me/profile", member, { departmentOtherText: `Fresh text ${run}` });
    const before = await state(member.personId);
    const histBefore = (await history(member.personId)).length;
    expect(before.department_other_status).toBe("pending");

    expect((await req("POST", url, admin)).statusCode).toBe(400); // no expectedText
    const stale = await req("POST", url, admin, { expectedText: "Astrophysics" });
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { code?: string; error?: { code?: string } }).code ?? (stale.json() as any).error?.code).toBe("DEPARTMENT_OTHER_CHANGED");
    const deptId = (await db.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'cse'`)).rows[0]!.id;
    const staleReject = await req("POST", `/v1/admin/department-other/${member.personId}/reject`, admin, { reason: "No", expectedText: "Astrophysics" });
    const staleLink = await req("POST", `/v1/admin/department-other/${member.personId}/link`, admin, { departmentId: deptId, expectedText: "Astrophysics" });
    expect(staleReject.statusCode).toBe(409);
    expect(staleLink.statusCode).toBe(409);
    expect((await req("POST", `/v1/admin/department-other/${member.personId}/reject`, admin, { reason: "No" })).statusCode).toBe(400);
    expect((await req("POST", `/v1/admin/department-other/${member.personId}/link`, admin, { departmentId: deptId })).statusCode).toBe(400);
    expect(await state(member.personId)).toEqual(before);
    expect((await history(member.personId)).length).toBe(histBefore);

    const ok = await req("POST", url, admin, { expectedText: `Fresh text ${run}` });
    expect(ok.statusCode).toBe(204);
    const hist = await history(member.personId);
    expect(hist.length).toBe(histBefore + 1);
    expect(hist[hist.length - 1]!.submitted_text).toBe(`Fresh text ${run}`);

    // Put the fixture back (pending, original text) for the reject and link tests that follow.
    await req("PATCH", "/v1/me/profile", member, { departmentOtherText: "Applied Astrophysics" });
    expect((await state(member.personId)).department_other_status).toBe("pending");
  });

  it("rejection needs a reason, keeps the text owner-only, and shows the member why", async () => {
    expect((await req("POST", `/v1/admin/department-other/${member.personId}/reject`, admin, {})).statusCode).toBe(400);
    const reject = await req("POST", `/v1/admin/department-other/${member.personId}/reject`, admin, { reason: "Not a real department", expectedText: "Applied Astrophysics" });
    expect(reject.statusCode).toBe(204);

    const row = await state(member.personId);
    expect(row.department_other_status).toBe("rejected");
    expect(row.department_other_rejection_reason).toBe("Not a real department");
    expect(row.department_other_text).toBe("Applied Astrophysics"); // never cleared

    const pub = await publicBundle(stranger);
    expect(pub.departmentOtherText).toBeNull();
    const own = await publicBundle(member);
    expect(own.departmentOtherText).toBe("Applied Astrophysics");
    expect(own.departmentOtherStatus).toBe("rejected");
    expect(own.departmentOtherRejectionReason).toBe("Not a real department");

    // Rejected submissions appear in the rejected tab.
    const queue = await req("GET", `/v1/admin/department-other/review?status=rejected&q=${run}`, admin);
    const subs = (queue.json() as { submissions: Array<Record<string, any>> }).submissions;
    expect(subs.some((s) => s.person_id === member.personId)).toBe(true);
  });

  it("linking moves the member to a catalog department and keeps the typed text stored", async () => {
    const deptId = (await db.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'cse'`)).rows[0]!.id;
    const link = await req("POST", `/v1/admin/department-other/${member.personId}/link`, admin, { departmentId: deptId, expectedText: "Applied Astrophysics" });
    expect(link.statusCode).toBe(204);

    const row = await state(member.personId);
    expect(row.department_id).toBe(deptId);
    expect(row.department_other_status).toBe("approved");
    expect(row.department_other_text).toBe("Applied Astrophysics"); // stored, just not shown

    const pub = await publicBundle(stranger);
    expect(pub.departmentCode).toBe("cse");
    expect(pub.departmentName).toBe("Computer Science and Engineering");
    expect(pub.departmentOtherText).toBeNull();

    const hist = await history(member.personId);
    expect(hist.map((h) => h.action)).toEqual([
      "submitted", "approved", "submitted", // earlier tests
      "submitted", "approved", "submitted", // stale-approval test (edit, approve, restore)
      "rejected", "linked",
    ]);
    expect(hist[hist.length - 1]!.target_department_id).toBe(deptId);

    // History is append-only at the database level.
    await expect(db.query(`DELETE FROM department_other_history WHERE person_id = $1`, [member.personId])).rejects.toThrow();
  });

  it("admin review history endpoints return the trail", async () => {
    const r = await req("GET", `/v1/admin/department-other/${member.personId}/history`, admin);
    expect(r.statusCode).toBe(200);
    const history = (r.json() as { history: Array<Record<string, any>> }).history;
    expect(history.length).toBe(8);
    expect(history[0]!.action).toBe("linked"); // newest first
    const all = await req("GET", "/v1/admin/department-other/history?limit=10", admin);
    expect(all.statusCode).toBe(200);
  });

  it("unknown person or missing submission 404s", async () => {
    expect((await req("POST", `/v1/admin/department-other/${stranger.personId}/approve`, admin)).statusCode).toBe(404);
    expect((await req("POST", `/v1/admin/department-other/00000000-0000-0000-0000-000000000000/approve`, admin)).statusCode).toBe(404);
  });
});
