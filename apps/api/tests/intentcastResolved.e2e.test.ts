import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import { SESSION_COOKIE } from "./helpers/login.js";

/**
 * Business progress steps (migration 068): an author closes a request as resolved with an outcome.
 * Requires a disposable test database (DATABASE_URL) with migrations through 068. No emails are sent:
 * members are seeded directly with sessions.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;

describe("Resolve a request (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  type Member = { id: string; cookie: string };
  let n = 0;

  async function member(): Promise<Member> {
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, profile_completed_at) VALUES ($1, $2, now()) RETURNING id`,
      [`res-${R}-${n++}@iitbhu.ac.in`, `Member ${n}`]
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

  const req = (method: "GET" | "POST" | "PATCH", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const newPost = async (who: Member) =>
    ((await req("POST", "/v1/intentcasts", who, { category: "collaboration", kind: "ask", content: `Looking for distributors ${R}-${n++}` })).json() as {
      intentcast: { id: string };
    }).intentcast.id;
  const row = async (id: string) =>
    (await db.query<{ status: string; closed_reason: string | null; resolved_outcome: string | null }>(
      "SELECT status, closed_reason, resolved_outcome FROM intentcasts WHERE id = $1",
      [id]
    )).rows[0]!;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("closes as resolved with the outcome, and the post leaves the feed", async () => {
    const author = await member();
    const viewer = await member();
    const id = await newPost(author);
    const res = await req("PATCH", `/v1/intentcasts/${id}/close`, author, { outcome: "got_help_here" });
    expect(res.statusCode, res.body).toBe(204);
    expect(await row(id)).toEqual({ status: "closed", closed_reason: "resolved", resolved_outcome: "got_help_here" });
    const feed = (await req("GET", "/v1/intentcasts?limit=48", viewer)).json() as { intentcasts: Array<{ id: string }> };
    expect(feed.intentcasts.some((p) => p.id === id)).toBe(false);
  });

  it("a plain close is unchanged: manual, no outcome", async () => {
    const author = await member();
    const id = await newPost(author);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, author)).statusCode).toBe(204);
    expect(await row(id)).toEqual({ status: "closed", closed_reason: "manual", resolved_outcome: null });
  });

  it("refuses an unknown outcome, extra keys, someone else's post, and a second close", async () => {
    const author = await member();
    const other = await member();
    const id = await newPost(author);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, author, { outcome: "great" })).statusCode).toBe(400);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, author, { outcome: "got_help_here", note: "x" })).statusCode).toBe(400);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, other, { outcome: "got_help_here" })).statusCode).toBe(403);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, author, { outcome: "no_longer_needed" })).statusCode).toBe(204);
    expect((await req("PATCH", `/v1/intentcasts/${id}/close`, author, { outcome: "got_help_here" })).statusCode).toBe(409);
    expect((await row(id)).resolved_outcome).toBe("no_longer_needed");
  });

  it("the database refuses an outcome without the resolved reason", async () => {
    const author = await member();
    const id = await newPost(author);
    await expect(db.query("UPDATE intentcasts SET resolved_outcome = 'got_help_here' WHERE id = $1", [id])).rejects.toThrow();
  });
});
