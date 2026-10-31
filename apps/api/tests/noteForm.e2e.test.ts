import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { composeNoteMessage, validateNoteDetails } from "../src/lib/noteDetails.js";
import { loginForTest } from "./helpers/login.js";
import { adviceNote, referralNote } from "./helpers/note.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };
const run = Date.now();

describe("note form rules (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let sender: Who;
  const recipients: Who[] = [];

  const send = (recipient: Who, body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/v1/contact-requests", headers: { cookie: sender.cookie }, payload: { recipientPersonId: recipient.personId, ...body } });
  const code = async (recipient: Who, body: Record<string, unknown>) => {
    const res = await send(recipient, body);
    return { status: res.statusCode, code: (res.json() as { code?: string }).code };
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    sender = await loginForTest(app, `note-sender-${run}@iitbhu.ac.in`);
    for (let i = 0; i < 4; i += 1) recipients.push(await loginForTest(app, `note-rcpt${i}-${run}@iitbhu.ac.in`));
    await db.query(`UPDATE people SET full_name = 'Note Sender', profile_completed_at = now() WHERE id = $1`, [sender.personId]);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("a bare message (no purpose) is refused; so is an unknown purpose", async () => {
    const r = recipients[0]!;
    expect(await code(r, { message: "Hi, could we talk about your team at some point soon?" })).toEqual({ status: 400, code: "CONTACT_REQUEST_PURPOSE_REQUIRED" });
    expect(await code(r, { note: { purpose: "hi" } })).toEqual({ status: 400, code: "CONTACT_REQUEST_PURPOSE_REQUIRED" });
  });

  it("referral: job link (http/https), role, company, fit 80–500, optional résumé link", async () => {
    const r = recipients[0]!;
    expect((await code(r, { note: referralNote({ jobUrl: "" }) })).code).toBe("CONTACT_REQUEST_JOB_LINK_REQUIRED");
    expect((await code(r, { note: referralNote({ jobUrl: "javascript:alert(1)" }) })).code).toBe("CONTACT_REQUEST_JOB_LINK_REQUIRED");
    expect((await code(r, { note: referralNote({ jobUrl: "https://nodot" }) })).code).toBe("CONTACT_REQUEST_JOB_LINK_REQUIRED");
    expect((await code(r, { note: referralNote({ role: "  " }) })).code).toBe("CONTACT_REQUEST_ROLE_REQUIRED");
    expect((await code(r, { note: referralNote({ company: "x".repeat(121) }) })).code).toBe("CONTACT_REQUEST_COMPANY_REQUIRED");
    expect((await code(r, { note: referralNote({ fit: "pls refer" }) })).code).toBe("CONTACT_REQUEST_FIT_LENGTH");
    expect((await code(r, { note: referralNote({ fit: "y".repeat(501) }) })).code).toBe("CONTACT_REQUEST_FIT_LENGTH");
    expect((await code(r, { note: referralNote({ resumeUrl: "my drive" }) })).code).toBe("CONTACT_REQUEST_RESUME_LINK_INVALID");
  });

  it("advice: a known topic and a question of 80–1000 characters", async () => {
    const r = recipients[0]!;
    expect((await code(r, { note: adviceNote({ topic: "gossip" }) })).code).toBe("CONTACT_REQUEST_TOPIC_REQUIRED");
    expect((await code(r, { note: adviceNote({ question: "any tips?" }) })).code).toBe("CONTACT_REQUEST_QUESTION_LENGTH");
    expect((await code(r, { note: adviceNote({ question: "q".repeat(1001) }) })).code).toBe("CONTACT_REQUEST_QUESTION_LENGTH");
  });

  it("a valid referral stores the fields, a message built from them, and the referral category", async () => {
    const r = recipients[0]!;
    const res = await send(r, { note: referralNote({ resumeUrl: "https://drive.example.com/cv" }), source: "match", sourceRank: 2 });
    expect(res.statusCode, res.body).toBe(201);
    const row = (await db.query(`SELECT message, details, source, source_category FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2`, [sender.personId, r.personId])).rows[0];
    expect(row.source_category).toBe("referral");
    expect(row.details).toMatchObject({ purpose: "referral", role: "Product Manager", company: "Example Co", resumeUrl: "https://drive.example.com/cv" });
    expect(row.message).toBe(
      "Referral request: Product Manager at Example Co\n\nWhy I'm a fit: " +
        referralNote().fit +
        "\n\nJob: https://jobs.example.com/pm\nRésumé: https://drive.example.com/cv",
    );
    // The recipient's inbox and the sender's sent list carry the fields.
    const inbox = (await app.inject({ method: "GET", url: "/v1/contact-requests/inbox", headers: { cookie: r.cookie } })).json() as {
      requests: Array<{ details: { purpose: string } | null; message: string }>;
    };
    expect(inbox.requests[0]!.details!.purpose).toBe("referral");
    const sent = (await app.inject({ method: "GET", url: "/v1/contact-requests/sent", headers: { cookie: sender.cookie } })).json() as {
      requests: Array<{ details: { purpose: string } | null }>;
    };
    expect(sent.requests[0]!.details!.purpose).toBe("referral");
  });

  it("advice maps its topic to the category; 'other' has none; with no source, no category", async () => {
    await send(recipients[1]!, { note: adviceNote({ topic: "relocation" }), source: "careers" });
    await send(recipients[2]!, { note: adviceNote({ topic: "other" }), source: "careers" });
    await send(recipients[3]!, { note: adviceNote({ topic: "career_switch" }) });
    const cat = async (r: Who) =>
      (await db.query<{ source_category: string | null }>(`SELECT source_category FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2`, [sender.personId, r.personId])).rows[0]!.source_category;
    expect(await cat(recipients[1]!)).toBe("relocation");
    expect(await cat(recipients[2]!)).toBeNull();
    expect(await cat(recipients[3]!)).toBeNull();
  });

  it("composes advice notes with the topic label; tidies spaces in short fields", () => {
    expect(composeNoteMessage(validateNoteDetails(adviceNote({ topic: "founder_advice" })))).toBe(`Advice · Starting up\n\n${adviceNote().question}`);
    expect(validateNoteDetails(referralNote({ role: "  Product   Manager ", resumeUrl: "" }))).toMatchObject({ role: "Product Manager", resumeUrl: null });
  });
});
