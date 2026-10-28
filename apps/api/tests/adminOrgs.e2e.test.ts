import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { maskEmail } from "../src/repos/organizationRepo.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
/** Every company this file creates starts with this, so searches only see them. */
const P = `Zq${run}`;

describe("admin company review API (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  const ids: Record<string, string> = {};

  const get = (url: string, who?: Who) => app.inject({ method: "GET", url, headers: who ? { cookie: who.cookie } : {} });
  const options = async (q: string) =>
    ((await get(`/v1/admin/orgs/approved?q=${encodeURIComponent(q)}`, admin)).json() as { organizations: Array<{ id: string; name: string }> })
      .organizations;
  const org = async (name: string, status: "approved" | "pending" | "rejected", canonical?: string, createdBy?: string) => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO organizations (name, approval_status, canonical_organization_id, created_by_person_id, reviewed_at, rejection_reason)
       VALUES ($1, $2, $3, $4, CASE WHEN $2 = 'rejected' THEN now() END, CASE WHEN $2 = 'rejected' THEN 'test' END) RETURNING id`,
      [name, status, canonical ?? null, createdBy ?? null],
    );
    ids[name] = r.rows[0]!.id;
    return r.rows[0]!.id;
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = await loginForTest(app, `orgrev-admin-${run}@iitbhu.ac.in`);
    member = await loginForTest(app, `orgrev-member-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);

    const main = await org(`${P} Goldman Sachs`, "approved");
    await org(`${P} Goldman`, "approved", main); // already linked: not offered as a main company
    await org(`${P} alpha labs`, "approved");
    await org(`${P} Pending Co`, "pending", undefined, member.personId);
    await org(`${P} Rejected Co`, "rejected");
    await org(`${P} 100%_Off`, "approved");
    for (let i = 0; i < 25; i += 1) await org(`${P} Bulk ${String(i).padStart(2, "0")}`, "approved");
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("admins only: signed out is 401, a member is 403", async () => {
    expect((await get("/v1/admin/orgs/approved?q=x")).statusCode).toBe(401);
    expect((await get("/v1/admin/orgs/approved?q=x", member)).statusCode).toBe(403);
    expect((await get("/v1/admin/orgs/pending", member)).statusCode).toBe(403);
    expect((await get("/v1/admin/orgs/approved?q=x", admin)).statusCode).toBe(200);
  });

  it("returns only ids and names of approved companies that aren't linked to another; ignores capitals; by name", async () => {
    const found = await options(`${P.toLowerCase()} G`);
    expect(found).toEqual([{ id: ids[`${P} Goldman Sachs`], name: `${P} Goldman Sachs` }]);
    // Pending, rejected and already-linked names are never offered.
    const names = (await options(P)).map((o) => o.name);
    expect(names).not.toContain(`${P} Goldman`);
    expect(names).not.toContain(`${P} Pending Co`);
    expect(names).not.toContain(`${P} Rejected Co`);
    expect(Object.keys((await options(`${P} alpha`))[0]!).sort()).toEqual(["id", "name"]);
  });

  it("at most 20 results, in name order", async () => {
    const found = await options(`${P} Bulk`);
    expect(found).toHaveLength(20);
    expect(found.map((o) => o.name)).toEqual(Array.from({ length: 20 }, (_, i) => `${P} Bulk ${String(i).padStart(2, "0")}`));
  });

  it("% and _ in the search are plain text, and no match is an empty list", async () => {
    expect((await options(`${P} 100%_`)).map((o) => o.name)).toEqual([`${P} 100%_Off`]);
    expect(await options(`${P} 100_%`)).toEqual([]);
    expect(await options(`${P} nothing like this`)).toEqual([]);
    expect((await get(`/v1/admin/orgs/approved?q=${"x".repeat(101)}`, admin)).statusCode).toBe(400);
  });

  it("the pending list shows masked creator emails; the full address never leaves the API", async () => {
    const res = await get("/v1/admin/orgs/pending?limit=200", admin);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(`orgrev-member-${run}@iitbhu.ac.in`);
    const row = (res.json() as { organizations: Array<{ name: string; createdByEmailMasked: string | null; createdAt: string }> }).organizations.find(
      (o) => o.name === `${P} Pending Co`,
    )!;
    expect(row.createdByEmailMasked).toBe("or•••@iitbhu.ac.in");
    expect(row.createdAt).toBeTruthy();
    expect(row).not.toHaveProperty("createdByInstitutionalEmail");
  });

  it("linking with the existing approval API keeps both records; the linked name stops being offered", async () => {
    const pending = ids[`${P} Pending Co`]!;
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/admin/orgs/${pending}`,
      headers: { cookie: admin.cookie },
      payload: { canonicalOrganizationId: ids[`${P} alpha labs`] },
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await db.query<{ id: string; approval_status: string; canonical_organization_id: string | null }>(
      `SELECT id, approval_status, canonical_organization_id FROM organizations WHERE id = ANY($1::uuid[])`,
      [[pending, ids[`${P} alpha labs`]]],
    );
    expect(rows.rowCount).toBe(2);
    expect(rows.rows.find((r) => r.id === pending)).toMatchObject({ approval_status: "approved", canonical_organization_id: ids[`${P} alpha labs`] });
    expect((await options(`${P} Pending`)).length).toBe(0);
  });
});

describe("maskEmail", () => {
  it("keeps the first two letters and the domain", () => {
    expect(maskEmail("shahaaryan.milan.mst20@itbhu.ac.in")).toBe("sh•••@itbhu.ac.in");
    expect(maskEmail("abc@iitbhu.ac.in")).toBe("a•••@iitbhu.ac.in");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("no-at-sign")).toBe("•••");
  });
});
