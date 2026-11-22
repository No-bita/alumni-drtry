import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { TEST_IDENTITY_SET } from "./helpers/identity.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();

describe("Home Wall admin pins (local database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who, superAdmin: Who, member: Who, demoAdmin: Who;
  const posts: string[] = [];
  const req = (method: "GET" | "PATCH", url: string, who?: Who, payload?: object) =>
    app.inject({ method, url, headers: who ? { cookie: who.cookie } : {}, ...(payload ? { payload } : {}) });
  const pin = (id: string, pinned = true, who = admin) => req("PATCH", `/v1/admin/intentcasts/${id}/pin`, who, { pinned });
  const resetPins = () => db.query("UPDATE wall_post_pins SET intentcast_id = NULL, pinned_at = NULL, pinned_by_person_id = NULL");
  const feed = async (query = "", who = member) => {
    const res = await req("GET", `/v1/intentcasts?limit=48&excludeAuthorSoftDeleted=true${query}`, who);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { intentcasts: Array<{ id: string; wallPinnedAt: string | null }>; pageInfo: { nextOffset: number | null } };
  };

  beforeAll(async () => {
    // These tests must be explicitly pointed at a local throwaway test database.
    const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost/alumni_test");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Wall pin tests require a local database.");
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (suffix: string, role: string, demo = false) => {
      const who = await loginForTest(app, `pin-${run}-${suffix}@iitbhu.ac.in`);
      await db.query(`UPDATE people SET ${TEST_IDENTITY_SET}, batch_year = 2019, role = $2, full_name = $3, is_demo = $4, profile_completed_at = now() WHERE id = $1`, [who.personId, role, `Pin ${suffix}`, demo]);
      return who;
    };
    admin = await person("admin", "admin");
    superAdmin = await person("super", "super_admin");
    member = await person("member", "alumni");
    demoAdmin = await person("demo", "admin", true);
    for (let n = 0; n < 5; n++) {
      const row = await db.query<{ id: string }>(`INSERT INTO intentcasts (author_person_id, content, category, status, expires_at, editable_until, created_at)
        VALUES ($1, $2, 'guidance', 'open', now() + interval '7 days', now() + interval '5 minutes', now() - ($3 * interval '1 hour')) RETURNING id`, [member.personId, `Pin test ${n}\nAn illustrative test post.`, n]);
      posts.push(row.rows[0]!.id);
    }
    await resetPins();
  });

  afterAll(async () => { await db?.end(); await app?.close(); });

  it("requires authentication and rejects alumni even for their own posts", async () => {
    expect((await req("PATCH", `/v1/admin/intentcasts/${posts[0]}/pin`, undefined, { pinned: true })).statusCode).toBe(401);
    expect((await pin(posts[0]!, true, member)).statusCode).toBe(403);
    expect([401, 403]).toContain((await pin(posts[0]!, true, demoAdmin)).statusCode);
  });

  it("validates the payload and refuses missing posts", async () => {
    expect((await req("PATCH", `/v1/admin/intentcasts/${posts[0]}/pin`, admin, { pinned: true, audience: "all" })).statusCode).toBe(400);
    expect((await pin("00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
  });

  it("allows admins and super-admins, is idempotent, and keeps a hard two-pin cap", async () => {
    await resetPins();
    const first = await pin(posts[4]!); expect(first.statusCode, first.body).toBe(200);
    expect((await pin(posts[4]!)).json().pinnedAt).toBe(first.json().pinnedAt);
    expect((await pin(posts[3]!, true, superAdmin)).statusCode).toBe(200);
    const third = await pin(posts[2]!);
    expect(third.statusCode).toBe(409); expect(third.json().code).toBe("WALL_PIN_LIMIT");
    expect((await db.query("SELECT intentcast_id FROM wall_post_pins WHERE intentcast_id IS NOT NULL")).rows).toHaveLength(2);
  });

  it("orders newest-pinned first before pagination, but leaves non-Wall and mine feeds unchanged", async () => {
    const home = await feed("&scope=home_wall");
    expect(home.intentcasts.slice(0, 2).map(x => x.id)).toEqual([posts[3], posts[4]]);
    const page2 = await feed("&scope=home_wall&offset=1");
    expect(page2.intentcasts[0]!.id).toBe(posts[4]);
    const normal = await feed(); expect(normal.intentcasts[0]!.id).toBe(posts[0]);
    expect(normal.intentcasts.every(x => !x.wallPinnedAt)).toBe(true);
    expect((await req("GET", "/v1/intentcasts?scope=home_wall&mine=true", member)).statusCode).toBe(400);
  });

  it("unpins explicitly and frees a slot without silently replacing another post", async () => {
    expect((await pin(posts[3]!, false)).statusCode).toBe(200);
    expect((await pin(posts[3]!, false)).statusCode).toBe(200);
    expect((await pin(posts[2]!)).statusCode).toBe(200);
    expect((await feed("&scope=home_wall")).intentcasts.slice(0,2).map(x=>x.id)).toEqual([posts[2], posts[4]]);
  });

  it("does not resurrect removed or closed posts; restoration does not silently re-pin", async () => {
    await db.query("UPDATE intentcasts SET author_soft_deleted_at = now() WHERE id = $1", [posts[2]]);
    expect((await feed("&scope=home_wall")).intentcasts.some(x=>x.id===posts[2])).toBe(false);
    expect((await pin(posts[2]!)).statusCode).toBe(404);
    await db.query("UPDATE intentcasts SET author_soft_deleted_at = NULL WHERE id = $1", [posts[2]]);
    expect((await feed("&scope=home_wall")).intentcasts.find(x=>x.id===posts[2])!.wallPinnedAt).toBeNull();
    await db.query("UPDATE intentcasts SET status = 'closed', closed_at = now(), closed_reason = 'manual', closed_by_person_id = $2 WHERE id = $1", [posts[4], member.personId]);
    expect((await feed("&scope=home_wall")).intentcasts.some(x=>x.id===posts[4])).toBe(false);
    expect((await pin(posts[4]!)).statusCode).toBe(404);
  });

  it("hides suspended authors even when pinned and refuses pinning their posts", async () => {
    await pin(posts[0]!);
    await db.query("UPDATE people SET suspended_at = now() WHERE id = $1", [member.personId]);
    const res = await req("GET", "/v1/intentcasts?scope=home_wall", admin);
    expect(res.json().intentcasts.some((x:{id:string})=>posts.includes(x.id))).toBe(false);
    expect((await pin(posts[1]!)).statusCode).toBe(404);
    await db.query("UPDATE people SET suspended_at = NULL WHERE id = $1", [member.personId]);
  });

  it("serializes simultaneous pin attempts: exactly two succeed and one hits the limit", async () => {
    await resetPins();
    const responses = await Promise.all([pin(posts[0]!), pin(posts[1]!, true, superAdmin), pin(posts[2]!)]);
    expect(responses.map(x=>x.statusCode).sort()).toEqual([200, 200, 409]);
    const slots = await db.query("SELECT slot, intentcast_id, pinned_by_person_id, pinned_at FROM wall_post_pins WHERE intentcast_id IS NOT NULL");
    expect(slots.rows).toHaveLength(2);
    expect(slots.rows.every(x=>x.pinned_by_person_id && x.pinned_at)).toBe(true);
    expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'wall_post_pins'")).rows[0]!.relrowsecurity).toBe(true);
  });
});
