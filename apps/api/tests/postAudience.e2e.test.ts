import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { institutionKey } from "../src/lib/postAudience.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import { SESSION_COOKIE } from "./helpers/login.js";

/**
 * Wall post audience (migration 066): every read path shows a narrowed post only to people it matches.
 * Requires a disposable test database (DATABASE_URL) with migrations through 066. No emails are sent
 * to real addresses: members are seeded directly with sessions.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;
const BHU = institutionKey("IIT (BHU) Varanasi");

describe("Wall post audience (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  let pune: string;
  let blr: string;
  let blrOld: string; // merged into blr

  type Member = { id: string; cookie: string };
  let n = 0;
  async function member(f: {
    domain?: string;
    batch?: number | null;
    dept?: string | null;
    place?: string | null;
    fullName?: string | null;
    city?: string | null;
  } = {}): Promise<Member> {
    const email = `aud-${R}-${n++}@${f.domain ?? "iitbhu.ac.in"}`;
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, batch_year, department_code, residence_canonical_place_id, residence_city, profile_completed_at)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, now()) RETURNING id`,
      [email, f.fullName === undefined ? `Member ${n}` : f.fullName, f.batch ?? null, f.dept ?? null, f.place ?? null, f.city ?? null]
    );
    const token = generateOpaqueToken(48);
    await new SessionRepo(db).create({
      authMethod: "otp",
      personId: row.rows[0]!.id,
      sessionHash: hashSecret(token, env.AUTH_SECRET_PEPPER),
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null
    });
    return { id: row.rows[0]!.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  const req = (method: "GET" | "POST", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const post = (who: Member, audience: unknown, extra: Record<string, unknown> = {}) =>
    req("POST", "/v1/intentcasts", who, {
      category: "collaboration",
      kind: "ask",
      content: `Audience test post ${R}-${n++}`,
      ...(audience !== undefined ? { audience } : {}),
      ...extra
    });
  const feedIds = async (who: Member) =>
    ((await req("GET", "/v1/intentcasts?limit=100", who)).json() as { intentcasts: Array<{ id: string }> }).intentcasts.map((i) => i.id);
  const sees = async (who: Member, id: string) => {
    const inFeed = (await feedIds(who)).includes(id);
    const viaLink = (await req("GET", `/v1/intentcasts/${id}`, who)).statusCode === 200;
    expect(viaLink, `feed and shared link must agree for ${id}`).toBe(inFeed);
    return inFeed;
  };

  beforeAll(async () => {
    app = await createApp();
    const place = async (label: string) =>
      (await db.query<{ id: string }>(`INSERT INTO canonical_places (country, city_label) VALUES ('India', $1) RETURNING id`, [label])).rows[0]!.id;
    pune = await place(`Pune ${R}`);
    blr = await place(`Bengaluru ${R}`);
    blrOld = await place(`Bangalore old ${R}`);
    await db.query(`UPDATE canonical_places SET status = 'combined', combined_into_place_id = $2 WHERE id = $1`, [blrOld, blr]);
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("posts default to Everyone and carry no audience; older posts are unaffected", async () => {
    const author = await member({ batch: 2020 });
    const other = await member({ domain: "iitb.ac.in" });
    const res = await post(author, undefined);
    expect(res.statusCode, res.body).toBe(201);
    const created = res.json().intentcast as { id: string; audience: unknown };
    expect(created.audience).toBeNull();
    expect(await sees(other, created.id)).toBe(true);
    const explicit = await post(author, { institution: null, batch: false });
    expect(explicit.json().intentcast.audience).toBeNull();
  });

  it("institute: only members with that institute's email domains see it (any institute can be picked)", async () => {
    const author = await member({ domain: "iitb.ac.in" });
    const bhuViewer = await member();
    const iitbViewer = await member({ domain: "iitb.ac.in" });
    const res = await post(author, { institution: BHU });
    expect(res.statusCode, res.body).toBe(201);
    const p = res.json().intentcast as { id: string; audience: { label: string; parts: string[] } };
    expect(p.audience).toEqual({ label: "IIT (BHU) Varanasi", parts: ["institution"] });
    expect(await sees(bhuViewer, p.id)).toBe(true);
    expect(await sees(iitbViewer, p.id)).toBe(false);
    expect(await sees(author, p.id)).toBe(true); // the author always sees their own post
  });

  it("batch, department and city use the author's own values, across institutes, combined with AND", async () => {
    const author = await member({ batch: 2019, dept: "cse", place: pune });
    const match = await member({ domain: "iitb.ac.in", batch: 2019, dept: "cse", place: pune });
    const wrongBatch = await member({ batch: 2018, dept: "cse", place: pune });
    const noCity = await member({ batch: 2019, dept: "cse", place: null, city: "Pune" });
    const res = await post(author, { batch: true, department: true, city: true });
    expect(res.statusCode, res.body).toBe(201);
    const p = res.json().intentcast as { id: string; audience: { parts: string[] } };
    expect(p.audience.parts).toEqual(["batch", "department", "city"]);
    expect(await sees(match, p.id)).toBe(true);
    expect(await sees(wrongBatch, p.id)).toBe(false);
    expect(await sees(noCity, p.id)).toBe(false); // unlinked free-text city never matches
  });

  it("a viewer linked to a merged city still matches", async () => {
    const author = await member({ place: blr });
    const oldLink = await member({ place: blrOld });
    const p = (await post(author, { city: true })).json().intentcast as { id: string };
    expect(await sees(oldLink, p.id)).toBe(true);
  });

  it("viewers are matched on their CURRENT profile", async () => {
    const author = await member({ place: pune });
    const mover = await member({ place: blr });
    const p = (await post(author, { city: true })).json().intentcast as { id: string };
    expect(await sees(mover, p.id)).toBe(false);
    await db.query("UPDATE people SET residence_canonical_place_id = $2 WHERE id = $1", [mover.id, pune]);
    expect(await sees(mover, p.id)).toBe(true);
  });

  it("outsiders can't reply, and get the same 404 as a missing post", async () => {
    const author = await member({ batch: 2001 });
    const insider = await member({ batch: 2001 });
    const outsider = await member({ batch: 2002 });
    const p = (await post(author, { batch: true })).json().intentcast as { id: string };
    const no = await req("POST", `/v1/intentcasts/${p.id}/respond`, outsider, { message: "Happy to help with this" });
    expect(no.statusCode).toBe(404);
    expect(no.json()).toEqual((await req("POST", "/v1/intentcasts/00000000-0000-4000-8000-000000000000/respond", outsider, { message: "Happy to help" })).json());
    const yes = await req("POST", `/v1/intentcasts/${p.id}/respond`, insider, { message: "Happy to help with this" });
    expect(yes.statusCode, yes.body).toBe(201);
  });

  it("city page posts follow the same rule", async () => {
    const author = await member({ batch: 2003, place: blr });
    const insider = await member({ batch: 2003 });
    const outsider = await member({ batch: 2004 });
    const p = (await post(author, { batch: true }, { placeId: blr })).json().intentcast as { id: string };
    const cityIds = async (who: Member) =>
      ((await req("GET", `/v1/cities/${blr}/posts`, who)).json() as { items: Array<{ id: string; audience?: unknown }> }).items;
    const seen = (await cityIds(insider)).find((x) => x.id === p.id);
    expect(seen?.audience).toEqual({ label: "2003 batch", parts: ["batch"] });
    expect((await cityIds(outsider)).some((x) => x.id === p.id)).toBe(false);
  });

  it("refuses details the author doesn't have, and an audience no one else matches", async () => {
    const author = await member({ batch: null, place: null });
    const missing = await post(author, { batch: true, city: true });
    expect(missing.statusCode).toBe(422);
    expect((missing.json() as { code: string }).code).toBe("AUDIENCE_DETAIL_MISSING");
    const lonely = await member({ dept: `zz${R}` }); // a department code nobody else has
    const empty = await post(lonely, { department: true });
    expect(empty.statusCode).toBe(422);
    expect((empty.json() as { code: string }).code).toBe("AUDIENCE_EMPTY");
    const unknown = await post(author, { institution: "nowhere" });
    expect(unknown.statusCode).toBe(400);
    const extraKey = await post(author, { institution: null, batchYear: 2020 });
    expect(extraKey.statusCode).toBe(400); // values never come from the client
  });

  it("the audience can't be changed after posting", async () => {
    const author = await member({ batch: 2005 });
    await member({ batch: 2005 });
    const p = (await post(author, { batch: true })).json().intentcast as { id: string };
    await app.inject({
      method: "PATCH",
      url: `/v1/intentcasts/${p.id}`,
      headers: { cookie: author.cookie },
      payload: { content: `Edited audience test ${R}`, audience: null }
    });
    const row = (await db.query<{ audience_batch_year: number | null }>("SELECT audience_batch_year FROM intentcasts WHERE id = $1", [p.id])).rows[0]!;
    expect(row.audience_batch_year).toBe(2005);
  });

  it("options and preview: own values, availability reasons, rounded sizes only", async () => {
    const author = await member({ batch: 2006, place: null, city: "Somewhere" });
    const opts = (await req("GET", "/v1/intentcasts/audience-options", author)).json() as {
      institutions: Array<{ key: string }>;
      ownInstitutionKey: string;
      batch: { available: boolean; value: string };
      city: { available: boolean; reason: string };
    };
    expect(opts.ownInstitutionKey).toBe(BHU);
    expect(opts.institutions.map((i) => i.key)).toContain(BHU);
    expect(opts.batch).toMatchObject({ available: true, value: "2006" });
    expect(opts.city).toMatchObject({ available: false, reason: "city_not_linked" });

    const everyone = (await req("POST", "/v1/intentcasts/audience-preview", author, { audience: null })).json();
    expect(everyone).toEqual({ everyone: true, label: null, size: null });
    for (let i = 0; i < 3; i++) await member({ batch: 2006 });
    const small = (await req("POST", "/v1/intentcasts/audience-preview", author, { audience: { batch: true } })).json() as {
      label: string;
      size: string;
      approx?: number;
    };
    expect(small.label).toBe("2006 batch");
    expect(["under10", "about"]).toContain(small.size);
    expect(Object.keys(small)).not.toContain("count");
  });
});
