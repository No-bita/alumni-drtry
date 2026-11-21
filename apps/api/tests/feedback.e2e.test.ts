import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };

const run = Date.now();

describe("member feedback (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  let other: Who;

  const post = (url: string, cookie: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { cookie }, payload });
  const get = (url: string, cookie: string) =>
    app.inject({ method: "GET", url, headers: { cookie } });

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = await loginForTest(app, `fb-admin-${run}@iitbhu.ac.in`);
    member = await loginForTest(app, `fb-member-${run}@iitbhu.ac.in`);
    other = await loginForTest(app, `fb-other-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    await db.query(`UPDATE people SET full_name = $2 WHERE id = $1`, [member.personId, `Feedback Member ${run}`]);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM feedback WHERE person_id = ANY($1::uuid[])`, [
      [member.personId, other.personId],
    ]);
    await db.end();
    await app.close();
  });

  it("rejects an empty message", async () => {
    const res = await post("/v1/feedback", member.cookie, { message: "   " });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a message over 3000 characters", async () => {
    const res = await post("/v1/feedback", member.cookie, { message: "x".repeat(3001) });
    expect(res.statusCode).toBe(400);
  });

  it("stores a member's note with their identity and shows it to an admin, newest first", async () => {
    const first = await post("/v1/feedback", member.cookie, { message: `First note ${run}` });
    expect(first.statusCode, first.body).toBe(201);
    const second = await post("/v1/feedback", member.cookie, { message: `Second note ${run}` });
    expect(second.statusCode, second.body).toBe(201);

    const res = await get("/v1/admin/feedback", admin.cookie);
    expect(res.statusCode, res.body).toBe(200);
    const { feedback } = res.json() as {
      feedback: Array<{ id: string; authorFullName: string | null; message: string; createdAt: string }>;
    };
    const mine = feedback.filter((f) => f.message.includes(`${run}`));
    expect(mine.map((f) => f.message)).toEqual([`Second note ${run}`, `First note ${run}`]);
    expect(mine[0]?.authorFullName).toBe(`Feedback Member ${run}`);
  });

  it("hides the admin list from non-admins", async () => {
    const res = await get("/v1/admin/feedback", other.cookie);
    expect(res.statusCode).toBe(403);
  });

  it("requires sign-in to submit", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/feedback", payload: { message: "hi" } });
    expect(res.statusCode).toBe(401);
  });
});
