/**
 * Deletion-free verification for the approved Cities finishing work (local disposable DB only).
 * Uses INSERT / SELECT / UPDATE only - never DELETE, never TRUNCATE. Leaves the database intact.
 * Covers: kind validation (400 on bogus kind), kind persistence on create + city post surfacing,
 * omitted kind staying NULL (no inference), pagination tie stability with identical created_at,
 * and closed / expired / author-soft-deleted exclusion from city posts.
 * Run: DATABASE_URL=postgres://postgres@127.0.0.1:5439/alma_cities_verify_test npx tsx tests/cities.deletionfree.verify.mts
 */
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { assertDisposableCitiesDatabase } from "./helpers/disposableDatabase.js";

const run = Date.now();
let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

assertDisposableCitiesDatabase(process.env.DATABASE_URL);
const app = await createApp();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const place = async (label: string) => {
  await db.query(
    `INSERT INTO canonical_places (country, city_label) VALUES ('India', $1)
     ON CONFLICT (lower(trim(country)), lower(trim(city_label))) DO NOTHING`,
    [label]
  );
  return (await db.query<{ id: string }>(`SELECT id FROM canonical_places WHERE lower(city_label) = lower($1) AND country = 'India'`, [label])).rows[0]!.id;
};
const placeA = await place(`Verifyville ${run}`);
const placeB = await place(`Tieburg ${run}`);

const login = await loginForTest(app, `df-${run}@iitbhu.ac.in`);
await db.query(
  `UPDATE people SET full_name = $2, batch_year = 2016, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
  [login.personId, `Verify ${run}`]
);
const auth = { cookie: login.cookie };
const post = (payload: unknown) => app.inject({ method: "POST", url: "/v1/intentcasts", headers: auth, payload: payload as object });
const cityPosts = (placeId: string, cursor?: string) =>
  app.inject({ method: "GET", url: `/v1/cities/${placeId}/posts${cursor ? `?cursor=${cursor}` : ""}`, headers: auth });

// 1. Bogus kind rejected.
const bogus = await post({ category: "mentorship", kind: "bogus", content: "bad kind", placeId: placeA });
check("bogus kind -> 400", bogus.statusCode === 400, `got ${bogus.statusCode}`);

// 2. kind persists and surfaces on city posts.
const offered = await post({ category: "mentorship", kind: "offer", content: `offer ${run}`, placeId: placeA });
check("create with kind offer -> 201", offered.statusCode === 201, `got ${offered.statusCode}`);
const offeredId = (offered.json() as any).intentcast.id;
let page = (await cityPosts(placeA)).json() as any;
let found = page.posts.find((p: any) => p.id === offeredId);
check("city posts surface kind=offer", found?.kind === "offer", `kind=${found?.kind}`);

// 3. Omitted kind stays NULL (no inference).
const unmarked = await post({ category: "hiring", content: `unmarked ${run}`, placeId: placeA });
const unmarkedId = (unmarked.json() as any).intentcast.id;
page = (await cityPosts(placeA)).json() as any;
found = page.posts.find((p: any) => p.id === unmarkedId);
check("omitted kind -> 201 and kind NULL on city posts", unmarked.statusCode === 201 && found && found.kind === null, `kind=${JSON.stringify(found?.kind)}`);
const dbRow = await db.query<{ kind: string | null }>(`SELECT kind FROM intentcasts WHERE id = $1`, [unmarkedId]);
check("omitted kind NULL in DB (no inference)", dbRow.rows[0]!.kind === null);

// 4. Pagination tie stability: 24 posts in Tieburg, all forced to the same created_at.
const tieIds: string[] = [];
for (let i = 0; i < 24; i++) {
  const r = await post({ category: "collaboration", kind: "ask", content: `tie ${run} ${i}`, placeId: placeB });
  tieIds.push((r.json() as any).intentcast.id);
}
await db.query(`UPDATE intentcasts SET created_at = '2026-01-01T00:00:00Z' WHERE place_id = $1`, [placeB]);
const seen: string[] = [];
let cursor: string | undefined;
let guard = 0;
do {
  const resp = (await cityPosts(placeB, cursor)).json() as any;
  seen.push(...resp.posts.map((p: any) => p.id));
  cursor = resp.nextCursor ?? undefined;
  guard++;
} while (cursor && guard < 10);
const unique = new Set(seen);
check("tied created_at: every post seen exactly once across pages", seen.length === 24 && unique.size === 24, `seen=${seen.length} unique=${unique.size}`);
check("tied created_at: all created posts present", tieIds.every((id) => unique.has(id)));

// 5. Exclusions (UPDATE only): closed, expired, author-soft-deleted posts drop out of city posts.
const mk = async (content: string) => (await (await post({ category: "guidance", kind: "invitation", content: `${content} ${run}`, placeId: placeA })).json() as any).intentcast.id as string;
const closedId = await mk("closed");
const expiredId = await mk("expired");
const softId = await mk("softdel");
const aliveId = await mk("alive");
await db.query(`UPDATE intentcasts SET status = 'closed', closed_at = now(), closed_reason = 'manual' WHERE id = $1`, [closedId]);
await db.query(`UPDATE intentcasts SET expires_at = now() - interval '1 day' WHERE id = $1`, [expiredId]);
await db.query(`UPDATE intentcasts SET author_soft_deleted_at = now() WHERE id = $1`, [softId]);
page = (await cityPosts(placeA)).json() as any;
const ids = new Set(page.posts.map((p: any) => p.id));
check("closed post excluded", !ids.has(closedId));
check("expired post excluded", !ids.has(expiredId));
check("author-soft-deleted post excluded", !ids.has(softId));
check("open post still listed", ids.has(aliveId));

// 6. Author visibility exclusions (UPDATE only; each state restored so checks stay independent).
const author2 = await loginForTest(app, `df2-${run}@iitbhu.ac.in`);
await db.query(
  `UPDATE people SET full_name = $2, batch_year = 2017, profile_completed_at = now(), onboarding_completed_at = now() WHERE id = $1`,
  [author2.personId, `VerifyTwo ${run}`]
);
const auth2 = { cookie: author2.cookie };
const mkBy2 = async () => ((await (await app.inject({ method: "POST", url: "/v1/intentcasts", headers: auth2, payload: { category: "mentorship", kind: "ask", content: `vis ${run}`, placeId: placeA } })).json() as any).intentcast.id as string);
const listed = async (id: string) => ((await cityPosts(placeA)).json() as any).posts.some((p: any) => p.id === id);
{
  const id = await mkBy2();
  check("visible author's post listed", await listed(id));
  await db.query(`UPDATE people SET suspended_at = now() WHERE id = $1`, [author2.personId]);
  check("suspended author's post excluded", !(await listed(id)));
  await db.query(`UPDATE people SET suspended_at = NULL, deleted_at = now() WHERE id = $1`, [author2.personId]);
  check("deleted author's post excluded", !(await listed(id)));
  await db.query(`UPDATE people SET deleted_at = NULL, full_name = NULL WHERE id = $1`, [author2.personId]);
  check("unnamed author's post excluded", !(await listed(id)));
  await db.query(`UPDATE people SET full_name = $2, is_test_user = TRUE WHERE id = $1`, [author2.personId, `VerifyTwo ${run}`]);
  // NODE_ENV=test makes demo/test alumni discoverable to tests by design (personIsDiscoverableAlumniSql);
  // the production-only exclusion branch cannot be exercised in this env - reported as such.
  check("test-env: demo author's post listed (demo seeds discoverable under NODE_ENV=test)", await listed(id));
  await db.query(`UPDATE people SET is_test_user = FALSE WHERE id = $1`, [author2.personId]);
  check("restored author's post listed again", await listed(id));
}

await db.end();
await app.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
