import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { cleanOrganizationName } from "../src/services/organizationService.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();
/** Every company this file creates starts with this, so searches only see them. */
const P = `Ze${run}`;

type Listed = { id: string; name: string; submittedName: string | null; linkedTo: { id: string; name: string } | null; linkedNames: number };
type Rename =
  | { result: "renamed"; organization: { id: string; name: string; submittedName: string | null; approvalStatus: string } }
  | { result: "taken"; existing: { id: string; name: string; status: string; linkedToName: string | null; linkTo: { id: string; name: string } | null } };

describe("admin company edit + link (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  const ids: Record<string, string> = {};

  const org = async (key: string, name: string, status: "approved" | "pending" | "rejected", canonical?: string) => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO organizations (name, approval_status, canonical_organization_id, reviewed_at, rejection_reason)
       VALUES ($1, $2, $3, CASE WHEN $2 = 'rejected' THEN now() END, CASE WHEN $2 = 'rejected' THEN 'test' END) RETURNING id`,
      [name, status, canonical ?? null],
    );
    ids[key] = r.rows[0]!.id;
    return r.rows[0]!.id;
  };
  const rename = (id: string, name: string, who: Who = admin) =>
    app.inject({ method: "PATCH", url: `/v1/admin/orgs/${id}/name`, headers: { cookie: who.cookie }, payload: { name } });
  const link = (id: string, to: string, who: Who = admin) =>
    app.inject({ method: "PATCH", url: `/v1/admin/orgs/${id}/link`, headers: { cookie: who.cookie }, payload: { canonicalOrganizationId: to } });
  const listed = async (q: string) =>
    (
      (await app.inject({ method: "GET", url: `/v1/admin/orgs/approved/all?q=${encodeURIComponent(q)}`, headers: { cookie: admin.cookie } })).json() as {
        organizations: Listed[];
      }
    ).organizations;
  const row = async (id: string) =>
    (
      await db.query<{ name: string; submitted_name: string | null; approval_status: string; canonical_organization_id: string | null }>(
        `SELECT name::TEXT AS name, submitted_name, approval_status, canonical_organization_id FROM organizations WHERE id = $1`,
        [id],
      )
    ).rows[0]!;

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = await loginForTest(app, `orgedit-admin-${run}@iitbhu.ac.in`);
    member = await loginForTest(app, `orgedit-member-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);

    const gs = await org("gs", `${P} Goldman Sachs`, "approved");
    await org("gsAlias", `${P} GS`, "approved", gs);
    await org("typo", `${P} goldmn sachs india pvt ltd`, "pending");
    await org("pending2", `${P} Another Pending`, "pending");
    await org("rejected", `${P} Rejected Co`, "rejected");
    const amazon = await org("amazon", `${P} Amazon`, "approved");
    await org("aws", `${P} AWS`, "approved");
    await org("awsAlias1", `${P} Amazon Web Services`, "approved", ids.aws);
    await org("awsAlias2", `${P} aws india`, "approved", ids.aws);
    void amazon;
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("admins only", async () => {
    expect((await rename(ids.typo!, "x y", member)).statusCode).toBe(403);
    expect((await link(ids.aws!, ids.amazon!, member)).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/admin/orgs/approved/all?q=x", headers: { cookie: member.cookie } })).statusCode).toBe(403);
  });

  it("names are tidied and checked: 2 to 120 characters, not unchanged, not a rejected company", async () => {
    expect(cleanOrganizationName("  Goldman \t  Sachs\u0000 ")).toBe("Goldman Sachs");
    expect((await rename(ids.typo!, " a ")).statusCode).toBe(400);
    expect((await rename(ids.typo!, "x".repeat(121))).statusCode).toBe(400);
    expect((await rename(ids.typo!, `${P} goldmn sachs india pvt ltd`)).json()).toMatchObject({ code: "ORG_NAME_UNCHANGED" });
    expect((await rename(ids.rejected!, `${P} Fresh name`)).json()).toMatchObject({ code: "ORG_REJECTED" });
    expect((await rename("00000000-0000-0000-0000-000000000000", `${P} Fresh name`)).statusCode).toBe(404);
  });

  it("renaming a pending company keeps it pending and remembers what was first typed (only the first)", async () => {
    const res = await rename(ids.typo!, `  ${P}   Goldman Sachs India `);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      result: "renamed",
      organization: { name: `${P} Goldman Sachs India`, submittedName: `${P} goldmn sachs india pvt ltd`, approvalStatus: "pending" },
    });
    await rename(ids.typo!, `${P} Goldman Sachs (India)`);
    expect(await row(ids.typo!)).toMatchObject({ name: `${P} Goldman Sachs (India)`, submitted_name: `${P} goldmn sachs india pvt ltd`, approval_status: "pending" });
    // The pending list carries it too.
    const pending = (await app.inject({ method: "GET", url: "/v1/admin/orgs/pending?limit=200", headers: { cookie: admin.cookie } })).json() as {
      organizations: Array<{ id: string; submittedName: string | null }>;
    };
    expect(pending.organizations.find((o) => o.id === ids.typo)!.submittedName).toBe(`${P} goldmn sachs india pvt ltd`);
  });

  it("a capitals-only change is allowed", async () => {
    const res = await rename(ids.pending2!, `${P} ANOTHER PENDING`);
    expect((res.json() as Rename).result).toBe("renamed");
  });

  it("name taken: nothing changes, and it says what it can be linked to instead", async () => {
    const before = await row(ids.typo!);
    // An approved main company (any capitals): link to it.
    let r = (await rename(ids.typo!, `${P} goldman sachs`)).json() as Rename;
    expect(r).toEqual({
      result: "taken",
      existing: { id: ids.gs, name: `${P} Goldman Sachs`, status: "approved", linkedToName: null, linkTo: { id: ids.gs, name: `${P} Goldman Sachs` } },
    });
    // A name already linked to another: link to its main company.
    r = (await rename(ids.typo!, `${P} GS`)).json() as Rename;
    expect(r).toMatchObject({ result: "taken", existing: { status: "linked", linkedToName: `${P} Goldman Sachs`, linkTo: { id: ids.gs } } });
    // Another pending or a rejected one: no link offered.
    r = (await rename(ids.typo!, `${P} Another Pending`)).json() as Rename;
    expect(r).toMatchObject({ result: "taken", existing: { status: "pending", linkTo: null } });
    r = (await rename(ids.typo!, `${P} Rejected Co`)).json() as Rename;
    expect(r).toMatchObject({ result: "taken", existing: { status: "rejected", linkTo: null } });
    // Renaming a main company to one of its own linked names: nothing to link to.
    r = (await rename(ids.gs!, `${P} GS`)).json() as Rename;
    expect(r).toMatchObject({ result: "taken", existing: { status: "linked", linkTo: null } });
    expect(await row(ids.typo!)).toEqual(before);
  });

  it("approved companies list: linked or not, with what each is linked to and how many names point at it", async () => {
    const all = await listed(P);
    const byName = Object.fromEntries(all.map((o) => [o.name, o]));
    expect(byName[`${P} Goldman Sachs`]).toMatchObject({ linkedTo: null, linkedNames: 1 });
    expect(byName[`${P} GS`]).toMatchObject({ linkedTo: { id: ids.gs, name: `${P} Goldman Sachs` }, linkedNames: 0 });
    expect(byName[`${P} AWS`]).toMatchObject({ linkedNames: 2 });
    expect(all.some((o) => o.name.includes("Pending") || o.name.includes("Rejected") || o.name.includes("Goldman Sachs (India)"))).toBe(false);
  });

  it("renaming an approved company keeps it approved and its links; the old name is searchable", async () => {
    const res = await rename(ids.amazon!, `${P} Amazon.com`);
    expect((res.json() as Rename).result).toBe("renamed");
    expect(await row(ids.amazon!)).toMatchObject({ name: `${P} Amazon.com`, submitted_name: `${P} Amazon`, approval_status: "approved" });
    expect((await listed(`${P} Amazon`)).map((o) => o.name)).toContain(`${P} Amazon.com`);
  });

  it("linking an approved company moves the names linked to it, keeping links one level deep; nothing deleted", async () => {
    const res = await link(ids.aws!, ids.amazon!);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ movedLinkedNames: 2, organization: { canonicalOrganizationId: ids.amazon } });
    for (const k of ["aws", "awsAlias1", "awsAlias2"]) {
      expect((await row(ids[k]!)).canonical_organization_id).toBe(ids.amazon);
    }
    expect((await row(ids.aws!)).approval_status).toBe("approved");
    const count = await db.query(`SELECT 1 FROM organizations WHERE id = ANY($1::uuid[])`, [Object.values(ids)]);
    expect(count.rowCount).toBe(Object.keys(ids).length);
  });

  it("link targets must be an approved main company other than itself; only approved companies can be linked this way", async () => {
    expect((await link(ids.amazon!, ids.amazon!)).json()).toMatchObject({ code: "ORG_INVALID_CANONICAL" });
    expect((await link(ids.gs!, ids.aws!)).json()).toMatchObject({ code: "ORG_INVALID_CANONICAL" }); // aws is linked now
    expect((await link(ids.gs!, ids.typo!)).json()).toMatchObject({ code: "ORG_INVALID_CANONICAL" }); // pending
    expect((await link(ids.typo!, ids.gs!)).json()).toMatchObject({ code: "ORG_NOT_APPROVED" });
    // A pending company still links through the review action as before.
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/admin/orgs/${ids.typo}`,
      headers: { cookie: admin.cookie },
      payload: { canonicalOrganizationId: ids.gs },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await row(ids.typo!)).toMatchObject({ approval_status: "approved", canonical_organization_id: ids.gs, name: `${P} Goldman Sachs (India)` });
  });
});
