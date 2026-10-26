import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

type App = Awaited<ReturnType<typeof createApp>>;

const cookieName = "alumni_session";
const run = Date.now();
/** Unique names per run so leftover rows from earlier runs never interfere. */
const ORG_X = `Zentrix${run}`;
const ORG_Z = `Quorbel${run}`;
const CITY = `Qorvale${run}`;

interface MatchBody {
  intent: { category: string | null; company: string | null; role: string | null; city: string | null; source: string };
  needsDetail: boolean;
  results: { id: string; fullName: string; whyThem: string; reasons: { key: string; text: string }[]; relevantOpenTo: string[] }[];
  fallback: string | null;
}

async function login(app: App, email: string): Promise<{ cookie: string; personId: string }> {
  const start = await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: email } });
  const link = new URL((start.json() as { debug: { magicLinkUrl: string } }).debug.magicLinkUrl);
  const verify = await app.inject({
    method: "GET",
    url: `/v1/auth/verify?challengeId=${encodeURIComponent(link.searchParams.get("challengeId")!)}&magicLinkToken=${encodeURIComponent(link.searchParams.get("magicLinkToken")!)}`
  });
  const raw = verify.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw[0]! : String(raw);
  const value = header.slice(header.indexOf(`${cookieName}=`) + cookieName.length + 1).split(";")[0]!;
  const me = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `${cookieName}=${value}` } });
  return { cookie: `${cookieName}=${value}`, personId: (me.json() as { person: { personId: string } }).person.personId };
}

describe("POST /v1/match (integration)", () => {
  let app: App;
  let db: Pool;
  let viewer: { cookie: string; personId: string };
  const ids: Record<string, string> = {};

  const post = (payload: unknown, cookie = viewer.cookie) =>
    app.inject({ method: "POST", url: "/v1/match", payload: payload as object, headers: { cookie } });

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    viewer = await login(app, `match-viewer-${run}@iitbhu.ac.in`);

    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const orgId = async (name: string) =>
      (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [name])).rows[0]!.id;
    const orgX = await orgId(ORG_X);
    const orgZ = await orgId(ORG_Z);
    const placeId = (
      await db.query<{ id: string }>(`INSERT INTO canonical_places (country, city_label) VALUES ('Germany', $1) RETURNING id`, [CITY])
    ).rows[0]!.id;

    const person = async (
      key: string,
      opts: { openTo?: string[]; completed?: boolean; suspended?: boolean; city?: boolean } = {}
    ) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO people (institutional_email, full_name, batch_year, bio, profile_completed_at, suspended_at,
                             open_to_preferences, residence_city, residence_country, residence_canonical_place_id)
         VALUES ($1, $2, 2018, 'Happy to help juniors.', $3, $4, $5::jsonb, $6, $7, $8) RETURNING id`,
        [
          `match-${key}-${run}@iitbhu.ac.in`,
          `Match ${key} ${run}`,
          opts.completed === false ? null : new Date(),
          opts.suspended ? new Date() : null,
          opts.openTo ? JSON.stringify({ selected: opts.openTo, descriptions: {} }) : null,
          opts.city ? CITY : null,
          opts.city ? "Germany" : null,
          opts.city ? placeId : null
        ]
      );
      ids[key] = r.rows[0]!.id;
      return r.rows[0]!.id;
    };
    const job = (personId: string, role: string, org: string | null, current: boolean) =>
      db.query(
        `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current, end_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [personId, ft, org, role, current, current ? null : "2023-01-01"]
      );

    await job(await person("currentPm", { openTo: ["referrals"] }), "Senior Product Manager", orgX, true);
    await job(await person("pastPm"), "Product Manager", orgX, false);
    await job(await person("suspended", { suspended: true, openTo: ["referrals"] }), "Product Manager", orgX, true);
    await job(await person("incomplete", { completed: false }), "Product Manager", orgX, true);
    await job(await person("berliner", { city: true, openTo: ["coffee"] }), "Software Engineer", orgZ, true);
    // The viewer also works at ORG_X and must never match themselves.
    await db.query(`UPDATE people SET full_name = 'Viewer', profile_completed_at = now() WHERE id = $1`, [viewer.personId]);
    await job(viewer.personId, "Product Manager", orgX, true);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("requires a session", async () => {
    const res = await post({ question: `referral at ${ORG_X}` }, "");
    expect(res.statusCode).toBe(401);
  });

  it("rejects too-short questions", async () => {
    const res = await post({ question: "hi" });
    expect(res.statusCode).toBe(400);
  });

  it("referral: only the current employee qualifies; hidden, incomplete and self are excluded", async () => {
    const res = await post({ question: `Need a referral for PM at ${ORG_X.toLowerCase()}` });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as MatchBody;
    expect(body.intent).toMatchObject({ category: "referral", company: ORG_X, role: "Product Manager", source: "rules" });
    const got = body.results.map((r) => r.id);
    expect(got).toEqual([ids.currentPm]);
    expect(body.results[0]!.whyThem).toBe(`Currently Senior Product Manager at ${ORG_X} · Open to referrals`);
    expect(body.results[0]!.relevantOpenTo).toEqual(["referrals"]);
    expect(got).not.toContain(viewer.personId);
    expect(body.fallback).toBeNull();
  });

  it("interview prep: company matches (current, then past) rank above role-only matches", async () => {
    const body = (await post({ question: `PM interview at ${ORG_X} next week` })).json() as MatchBody;
    expect(body.intent.category).toBe("interview_prep");
    expect(body.results.slice(0, 2).map((r) => r.id)).toEqual([ids.currentPm, ids.pastPm]);
    expect(body.results[1]!.reasons[0]!.text).toBe(`Previously Product Manager at ${ORG_X}`);
    // Anyone after them is a PM elsewhere (role-only), never someone hidden or the viewer.
    for (const r of body.results.slice(2)) {
      expect(r.reasons[0]!.key).toMatch(/^(current_role|past_role)$/);
    }
    const all = body.results.map((r) => r.id);
    expect(all).not.toContain(ids.suspended);
    expect(all).not.toContain(ids.incomplete);
    expect(all).not.toContain(viewer.personId);
  });

  it("relocation: matches on the directory's canonical place", async () => {
    const body = (await post({ question: `Moving to ${CITY} next month, need a flat` })).json() as MatchBody;
    expect(body.intent).toMatchObject({ category: "relocation", city: CITY });
    expect(body.results.map((r) => r.id)).toEqual([ids.berliner]);
    expect(body.results[0]!.whyThem).toBe(`Lives in ${CITY}, Germany · Open to coffee chats`);
  });

  it("asks for detail when there is nothing to search on", async () => {
    const body = (await post({ question: "Moving to a new city alone" })).json() as MatchBody;
    expect(body.needsDetail).toBe(true);
    expect(body.results).toEqual([]);
    expect(body.fallback).toBeNull();
  });

  it("overrides replace parsed values; no match suggests a bulletin", async () => {
    const body = (await post({ question: `referral at ${ORG_X}`, overrides: { company: `Nobody${run}` } })).json() as MatchBody;
    expect(body.intent.company).toBe(`Nobody${run}`);
    expect(body.results).toEqual([]);
    expect(body.fallback).toBe("post_bulletin");
  });

  it("SQL only fetches rows that can qualify, so the candidate limit never hides a real match", async () => {
    const { MatchRepo } = await import("../src/repos/matchRepo.js");
    const { buildCandidateQuery } = await import("../src/services/matchService.js");
    const { parseMatchQuestion } = await import("../src/lib/matchIntent.js");
    const { rankMatches } = await import("../src/lib/matchScore.js");
    const repo = new MatchRepo(db);
    const question = `Moving to ${CITY}, also used to work at ${ORG_X}`;
    const lexicon = await repo.findLexicon(question);
    const intent = parseMatchQuestion(question, lexicon);
    expect(intent.category).toBe("relocation");
    const query = { ...buildCandidateQuery(intent, lexicon, { viewerPersonId: viewer.personId, viewerIsDemo: false }), candidateLimit: 1 };
    const rows = await repo.findCandidates(query);
    // ORG_X employees score higher in SQL but cannot qualify for relocation, so they are not fetched.
    expect(rows.map((r) => r.personId)).toEqual([ids.berliner]);
    expect(rankMatches(intent, rows).map((m) => m.candidate.personId)).toEqual([ids.berliner]);
  });

  it("strips NUL and control characters instead of failing", async () => {
    const res = await post({ question: `referral for PM at ${ORG_X}\u0000` , overrides: { role: "Product\u0000 Manager" } });
    expect(res.statusCode, res.body).toBe(200);
  });

  it("logs stats without question text, entity values or person id", async () => {
    const cols = (
      await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'match_queries' ORDER BY ordinal_position`
      )
    ).rows.map((r) => r.column_name);
    expect(cols).toEqual(["id", "category", "detected_fields", "parser_source", "result_count", "had_overrides", "created_at"]);

    await post({ question: `Need a referral for PM at ${ORG_X}` });
    const last = (
      await db.query<{ category: string; detected_fields: string[]; result_count: number }>(
        `SELECT category, detected_fields, result_count FROM match_queries ORDER BY id DESC LIMIT 1`
      )
    ).rows[0]!;
    expect(last.category).toBe("referral");
    expect(last.detected_fields).toEqual(["company", "role"]);
    expect(last.result_count).toBe(1);
    expect(JSON.stringify(last)).not.toContain(ORG_X);
  });
});
