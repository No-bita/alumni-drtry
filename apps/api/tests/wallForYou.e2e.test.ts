import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { TEST_IDENTITY_SET } from "./helpers/identity.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();

/** "Opportunities for you" ranking against a real database (local throwaway test database only). */
describe("Home Wall: Opportunities for you (local database only)", () => {
  let app: App;
  let db: Pool;
  let viewer: Who, author: Who;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost/alumni_test");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("For-you tests require a local database.");
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (suffix: string) => {
      const who = await loginForTest(app, `foryou-${run}-${suffix}@iitbhu.ac.in`);
      await db.query(`UPDATE people SET ${TEST_IDENTITY_SET}, batch_year = 2021, role = 'alumni', full_name = $2, profile_completed_at = now() WHERE id = $1`, [who.personId, `For you ${suffix}`]);
      return who;
    };
    viewer = await person("viewer");
    author = await person("author");
    // 2021 graduate → 3–7 years in 2026 (the band is computed from the current year).
    await db.query(`UPDATE people SET job_function = 'product', open_to_preferences = '{"selected":["mentorship"]}'::jsonb WHERE id = $1`, [viewer.personId]);
    await db.query(`INSERT INTO person_areas (person_id, label, position) VALUES ($1, 'Pricing', 0)`, [viewer.personId]);

    await db.query("UPDATE wall_post_pins SET intentcast_id = NULL, pinned_at = NULL, pinned_by_person_id = NULL");
    const post = async (key: string, who: Who, content: string, category: string, hoursAgo: number, hiring?: { fn: string; exp: string }) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO intentcasts (author_person_id, content, category, status, expires_at, editable_until, created_at,
           hiring_function, hiring_experience, hiring_respond_via)
         VALUES ($1, $2, $3, 'open', now() + interval '7 days', now() + interval '5 minutes', now() - ($4 * interval '1 hour'), $5, $6, $7)
         RETURNING id`,
        [who.personId, content, category, hoursAgo, hiring?.fn ?? null, hiring?.exp ?? null, hiring ? "reachout" : null]
      );
      ids[key] = r.rows[0]!.id;
    };
    // Newest first by time, so any tier order that differs from this proves the ranking.
    await post("general", author, `[[cat:general]]\nFor you ${run}: anyone up for a run?`, "collaboration", 1);
    await post("own", viewer, `[[cat:general]]\nFor you ${run}: my own post`, "collaboration", 2);
    await post("area", author, `[[cat:general]]\nFor you ${run}: need help with pricing strategy`, "collaboration", 3);
    await post("areaInsideWord", author, `[[cat:general]]\nFor you ${run}: repricings everywhere`, "collaboration", 4);
    await post("guidance", author, `[[cat:guidance]]\nFor you ${run}: career guidance wanted`, "guidance", 5);
    await post("hiringOther", author, `For you ${run}: hiring designers`, "hiring", 6, { fn: "design", exp: "3_7" });
    await post("hiringMatch", author, `For you ${run}: hiring PMs`, "hiring", 7, { fn: "product", exp: "3_7" });
  });

  afterAll(async () => { await db?.end(); await app?.close(); });

  const feed = async (query: string) => {
    const res = await app.inject({ method: "GET", url: `/v1/intentcasts?limit=48&excludeAuthorSoftDeleted=true&scope=home_wall${query}`, headers: { cookie: viewer.cookie } });
    expect(res.statusCode, res.body).toBe(200);
    const mine = new Set(Object.values(ids));
    return (res.json() as { intentcasts: Array<{ id: string }> }).intentcasts.map((x) => x.id).filter((id) => mine.has(id));
  };
  const key = (id: string) => Object.entries(ids).find(([, v]) => v === id)![0];

  it("ranks matching hiring, then asks the viewer can help with, then the rest, and leaves out own posts", async () => {
    const order = (await feed("&sort=for_you")).map(key);
    expect(order).toEqual(["hiringMatch", "area", "guidance", "general", "areaInsideWord", "hiringOther"]);
  });

  it("keeps the default order without sort, own posts included", async () => {
    const order = (await feed("")).map(key);
    expect(order).toContain("own");
  });

  it("requires the Home Wall scope", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/intentcasts?sort=for_you", headers: { cookie: viewer.cookie } });
    expect(res.statusCode).toBe(400);
  });
});
