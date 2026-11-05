import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { assertDisposableCitiesDatabase } from "./helpers/disposableDatabase.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string; email: string };
const run = Date.now();

describe("notification seen state (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let sender: Who;
  let other: Who;
  let recipient: Who;

  const req = (method: "GET" | "POST" | "PATCH", url: string, w: Who, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: w.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const note = (w: Who, recipientPersonId: string, message: string) =>
    req("POST", "/v1/contact-requests", w, { recipientPersonId, message, source: "cities", sourceCategory: "coffee" });
  const listFor = async (w: Who) => (await req("GET", "/v1/notifications", w)).json().items as Array<{ kind: string; unseen: boolean }>;
  const summaryFor = async (w: Who) => (await req("GET", "/v1/notifications/summary", w)).json() as { count: number; unseenCount: number };

  beforeAll(async () => {
    assertDisposableCitiesDatabase(process.env.DATABASE_URL);
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string) => {
      const email = `seen-${key}-${run}@iitbhu.ac.in`;
      const p = await loginForTest(app, email);
      await db.query(
        `UPDATE people SET full_name = $2, batch_year = 2019, profile_completed_at = now(), onboarding_completed_at = now(),
                           open_to_preferences = $3::jsonb WHERE id = $1`,
        [p.personId, `${key} ${run}`, JSON.stringify({ selected: ["coffee"], descriptions: {} })]
      );
      return { ...p, email };
    };
    sender = await person("sender");
    other = await person("other");
    recipient = await person("recipient");
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("new activity is unseen; mark-all-seen clears emphasis and badge but keeps the row; newer activity is unseen again", async () => {
    expect((await listFor(recipient)).length).toBe(0);
    expect(await summaryFor(recipient)).toMatchObject({ count: 0, unseenCount: 0 });

    // A note arrives: unseen, counted.
    const sent = await note(sender, recipient.personId, "hello, would love to connect over coffee sometime this week");
    expect(sent.statusCode).toBe(201);
    let list = await listFor(recipient);
    expect(list.length).toBe(1);
    expect(list[0]!.kind).toBe("contact_request_received");
    expect(list[0]!.unseen).toBe(true);
    expect((await summaryFor(recipient)).unseenCount).toBe(1);

    // Mark all as seen: the row stays (history preserved), emphasis and badge clear.
    expect((await req("POST", "/v1/notifications/mark-all-seen", recipient)).statusCode).toBe(200);
    list = await listFor(recipient);
    expect(list.length).toBe(1);
    expect(list[0]!.unseen).toBe(false);
    expect(await summaryFor(recipient)).toMatchObject({ count: 1, unseenCount: 0 });

    // Activity newer than the watermark is unseen again.
    expect((await note(other, recipient.personId, "also reaching out about settling in, coffee chat works")).statusCode).toBe(201);
    list = await listFor(recipient);
    expect(list.length).toBe(2);
    expect(list.filter((i) => i.unseen).length).toBe(1);
    expect((await summaryFor(recipient)).unseenCount).toBe(1);
  }, 60_000);

  it("mark-all-seen is per-person and idempotent", async () => {
    // The sender marks their own (empty) list; the recipient's unseen state is untouched.
    expect((await req("POST", "/v1/notifications/mark-all-seen", sender)).statusCode).toBe(200);
    expect((await req("POST", "/v1/notifications/mark-all-seen", sender)).statusCode).toBe(200);
    expect((await summaryFor(recipient)).unseenCount).toBe(1);
  }, 60_000);
});
