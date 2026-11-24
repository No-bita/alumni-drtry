import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { experienceBandForBatchYear, experienceBandSql } from "../src/lib/jobFunctions.js";
import { BrokerRepo } from "../src/repos/brokerRepo.js";
import { BrokerService, helperAskLine } from "../src/services/brokerService.js";
import { TestCaptureEmailSender } from "../src/services/emailSender.js";
import { referralNote } from "./helpers/note.js";

/** Brokered requests (migration 076): first yes wins, declines stay private, 2-day window, emails gated. */

const ASKER = "11111111-1111-4111-8111-111111111111";
const HELPER = "22222222-2222-4222-8222-222222222222";
const ASK = "33333333-3333-4333-8333-333333333333";
const REQ = "44444444-4444-4444-8444-444444444444";

type Handler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } | undefined;

/** A pool whose queries are answered by `handler` (by SQL text), recording every statement. */
function fakePool(handler: Handler) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [], rowCount: 0 };
    const out = handler(sql, params) ?? { rows: [] };
    return { rows: out.rows, rowCount: out.rowCount ?? out.rows.length };
  });
  const client = { query, release: vi.fn() };
  return { pool: { query, connect: vi.fn(async () => client) }, calls };
}

const person = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  full_name: id === ASKER ? "Asha Rao" : "Vikram Iyer",
  institutional_email: id === ASKER ? "asha@iitbhu.ac.in" : "vikram@iitb.ac.in",
  personal_email: null,
  batch_year: 2020,
  ...over
});

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: REQ,
  kind: "referral",
  asker_person_id: ASKER,
  intentcast_id: null,
  company: "Swiggy",
  job_function: "product",
  experience_band: "3_7",
  role_title: "Product Manager",
  job_url: "https://jobs.example.com/pm",
  message: "Referral request: Product Manager at Swiggy",
  details: { purpose: "referral", role: "Product Manager", company: "Swiggy", jobUrl: "https://jobs.example.com/pm", fit: "x", resumeUrl: null },
  status: "open",
  asked_count: 6,
  expires_at: new Date(Date.now() + 3_600_000),
  contact_request_id: null,
  first_seen_at: null,
  connected_at: null,
  expired_at: null,
  created_at: new Date(),
  ...over
});

function respondHandler(ask: { ask_status: string; request_status: string; expires_at?: Date }): Handler {
  return (sql, params) => {
    if (sql.includes("WITH due AS")) return { rows: [] };
    if (sql.includes("FROM broker_asks ba JOIN broker_requests br")) {
      return {
        rows: [{ ask_id: ASK, helper_person_id: HELPER, request_id: REQ, expires_at: new Date(Date.now() + 3_600_000), ...ask }]
      };
    }
    if (sql.startsWith("SELECT * FROM broker_requests WHERE id")) return { rows: [requestRow()] };
    if (sql.includes("FROM people WHERE id = $1")) return { rows: [person(params[0] as string)] };
    if (sql.includes("UPDATE broker_asks SET status = $2")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO contact_requests")) return { rows: [{ id: "cr-1" }] };
    if (sql.includes("SET status = 'connected'")) return { rows: [], rowCount: 1 };
    if (sql.includes("SET status = 'withdrawn'")) return { rows: [{ helper_person_id: "someone-else" }] };
    return undefined;
  };
}

afterEach(() => {
  (env as { BROKER_EMAILS_ENABLED: boolean }).BROKER_EMAILS_ENABLED = false;
});

describe("experience from graduation year", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  it("is Intern before graduating, then 0–3, 3–7 and 7+ years", () => {
    expect(experienceBandForBatchYear(2028, now)).toBe("intern");
    expect(experienceBandForBatchYear(2026, now)).toBe("0_3");
    expect(experienceBandForBatchYear(2024, now)).toBe("0_3");
    expect(experienceBandForBatchYear(2023, now)).toBe("3_7");
    expect(experienceBandForBatchYear(2020, now)).toBe("3_7");
    expect(experienceBandForBatchYear(2019, now)).toBe("7_plus");
    expect(experienceBandForBatchYear(null, now)).toBeNull();
  });

  it("uses the same rule in SQL, never matching a missing year", () => {
    const sql = experienceBandSql("p.batch_year");
    expect(sql).toContain("WHEN p.batch_year IS NULL THEN NULL");
    expect(sql).toContain("< 0 THEN 'intern'");
    expect(sql).toContain("< 3 THEN '0_3'");
    expect(sql).toContain("< 7 THEN '3_7'");
    expect(sql).toContain("ELSE '7_plus'");
  });
});

describe("who gets asked", () => {
  it("referral: everyone at the company now (not only those open to referrals), never the asker", async () => {
    const { pool, calls } = fakePool(() => ({ rows: [{ person_id: HELPER, company: "Swiggy" }] }));
    const found = await new BrokerRepo(pool as never).referralHelpers(" swiggy ", ASKER, false);
    expect(found).toEqual({ company: "Swiggy", helperIds: [HELPER] });
    expect(calls[0]!.sql).toContain("occ.is_current");
    expect(calls[0]!.sql).toContain("lower(COALESCE(canon.name, org.name)::text) = lower($1)");
    expect(calls[0]!.sql).not.toContain("open_to_preferences");
    expect(calls[0]!.params).toEqual(["swiggy", ASKER]);
  });

  it("hiring: matching function and experience from graduation year", async () => {
    const { pool, calls } = fakePool(() => ({ rows: [{ id: HELPER }] }));
    expect(await new BrokerRepo(pool as never).hiringHelpers("product", "3_7", ASKER, false)).toEqual([HELPER]);
    expect(calls[0]!.sql).toContain("p.job_function = $1");
    expect(calls[0]!.sql).toContain(experienceBandSql("p.batch_year"));
    expect(calls[0]!.params).toEqual(["product", "3_7", ASKER]);
  });
});

describe("answering an ask", () => {
  it("the first yes connects: an accepted reachout with the helper's contact, others withdrawn", async () => {
    const { pool, calls } = fakePool(respondHandler({ ask_status: "asked", request_status: "open" }));
    const result = await new BrokerService(pool as never, new TestCaptureEmailSender()).respond(HELPER, ASK, "accept");
    expect(result).toEqual({ status: "connected", askerContact: "asha@iitbhu.ac.in", askerName: "Asha Rao" });
    const insert = calls.find((c) => c.sql.includes("INSERT INTO contact_requests"))!;
    expect(insert.sql).toContain("'accepted'");
    expect(insert.params).toEqual(expect.arrayContaining([ASKER, HELPER, "vikram@iitb.ac.in", "referral_request", "referral"]));
    expect(calls.some((c) => c.sql.includes("SET status = 'withdrawn'") && c.params[1] === ASK)).toBe(true);
    expect(calls.some((c) => c.sql.includes("FOR UPDATE OF br, ba"))).toBe(true);
  });

  it("WhatsApp yes can share the number instead of the email", async () => {
    const { pool, calls } = fakePool(respondHandler({ ask_status: "asked", request_status: "open" }));
    await new BrokerService(pool as never, new TestCaptureEmailSender()).respond(HELPER, ASK, "accept", { sharedContactOverride: "+919800000000" });
    expect(calls.find((c) => c.sql.includes("INSERT INTO contact_requests"))!.params).toContain("+919800000000");
  });

  it("not this time: nothing is created and the asker is not told", async () => {
    const { pool, calls } = fakePool(respondHandler({ ask_status: "asked", request_status: "open" }));
    const capture = new TestCaptureEmailSender();
    (env as { BROKER_EMAILS_ENABLED: boolean }).BROKER_EMAILS_ENABLED = true;
    expect((await new BrokerService(pool as never, capture).respond(HELPER, ASK, "decline")).status).toBe("declined");
    expect(calls.some((c) => c.sql.includes("INSERT INTO contact_requests"))).toBe(false);
    expect(capture.brokerEmails).toHaveLength(0);
  });

  it("after someone else said yes: told it's taken care of", async () => {
    const { pool } = fakePool(respondHandler({ ask_status: "withdrawn", request_status: "connected" }));
    await expect(new BrokerService(pool as never, new TestCaptureEmailSender()).respond(HELPER, ASK, "accept")).rejects.toMatchObject({
      statusCode: 409,
      code: "BROKER_ALREADY_HELPED"
    });
  });

  it("after the 2 days: closed", async () => {
    const { pool } = fakePool(respondHandler({ ask_status: "asked", request_status: "open", expires_at: new Date(Date.now() - 1000) }));
    await expect(new BrokerService(pool as never, new TestCaptureEmailSender()).respond(HELPER, ASK, "accept")).rejects.toMatchObject({
      code: "BROKER_REQUEST_CLOSED"
    });
  });

  it("only the helper who was asked can answer", async () => {
    const { pool } = fakePool(respondHandler({ ask_status: "asked", request_status: "open" }));
    await expect(new BrokerService(pool as never, new TestCaptureEmailSender()).respond(ASKER, ASK, "accept")).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe("making a referral request", () => {
  function service(handler: Handler) {
    const { pool, calls } = fakePool(handler);
    return { svc: new BrokerService(pool as never, new TestCaptureEmailSender()), calls };
  }

  it("uses the referral note rules", async () => {
    const { svc } = service(() => undefined);
    await expect(svc.createReferralRequest(ASKER, false, { jobFunction: "product", note: referralNote({ jobUrl: "" }) as never })).rejects.toMatchObject({
      statusCode: 400,
      code: "CONTACT_REQUEST_JOB_LINK_REQUIRED"
    });
  });

  it("says so before sending when nobody is at the company", async () => {
    const { svc } = service((sql) => (sql.includes("occ.is_current") ? { rows: [] } : undefined));
    await expect(svc.createReferralRequest(ASKER, false, { jobFunction: "product", note: referralNote() as never })).rejects.toMatchObject({
      statusCode: 422,
      code: "BROKER_NO_ALUMNI"
    });
  });

  it("one open request per company, and at most 3 open at once", async () => {
    const dup = service((sql) => (sql.includes("kind = 'referral' AND status = 'open'") ? { rows: [{ id: "r", company: "example co" }] } : undefined));
    await expect(dup.svc.createReferralRequest(ASKER, false, { jobFunction: "product", note: referralNote() as never })).rejects.toMatchObject({
      code: "BROKER_DUPLICATE_OPEN"
    });
    const many = service((sql) =>
      sql.includes("kind = 'referral' AND status = 'open'") ? { rows: [{ id: "1", company: "A" }, { id: "2", company: "B" }, { id: "3", company: "C" }] } : undefined
    );
    await expect(many.svc.createReferralRequest(ASKER, false, { jobFunction: "product", note: referralNote() as never })).rejects.toMatchObject({
      statusCode: 429
    });
  });

  it("asks every eligible alum at once, for 2 days, with the company's own spelling", async () => {
    const { svc, calls } = service((sql, params) => {
      if (sql.includes("kind = 'referral' AND status = 'open'")) return { rows: [] };
      if (sql.includes("occ.is_current")) return { rows: [{ person_id: HELPER, company: "Example Co" }, { person_id: "h2", company: "Example Co" }] };
      if (sql.includes("FROM people WHERE id = $1")) return { rows: [person(params[0] as string)] };
      if (sql.includes("INSERT INTO broker_requests")) return { rows: [requestRow({ company: "Example Co", asked_count: 2 })] };
      if (sql.includes("INSERT INTO broker_asks")) return { rows: [{ id: "a1", helper_person_id: HELPER }, { id: "a2", helper_person_id: "h2" }] };
      if (sql.includes("FROM broker_requests br")) return { rows: [{ ...requestRow({ company: "Example Co", asked_count: 2 }), seen_count: "0" }] };
      if (sql.includes("FROM app_settings")) return { rows: [] };
      return undefined;
    });
    const view = await svc.createReferralRequest(ASKER, false, { jobFunction: "product", note: referralNote({ company: "example co" }) as never });
    expect(view.askedCount).toBe(2);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO broker_requests"))!;
    expect(insert.params[3]).toBe("Example Co");
    const expires = insert.params[10] as Date;
    expect(Math.round((expires.getTime() - Date.now()) / 3_600_000)).toBe(48);
    expect(calls.find((c) => c.sql.includes("INSERT INTO broker_asks"))!.params[1]).toEqual([HELPER, "h2"]);
  });
});

describe("emails", () => {
  it("stay off while automatic emails are paused, and go out per event when switched on", async () => {
    const expired = [requestRow({ status: "expired", expired_at: new Date() })];
    const run = async (enabled: boolean) => {
      (env as { BROKER_EMAILS_ENABLED: boolean }).BROKER_EMAILS_ENABLED = enabled;
      const capture = new TestCaptureEmailSender();
      const { pool } = fakePool((sql) => {
        if (sql.includes("WITH due AS")) return { rows: expired };
        if (sql.includes("FROM people WHERE id = ANY")) return { rows: [person(ASKER)] };
        return undefined;
      });
      expect(await new BrokerService(pool as never, capture).expireDue()).toBe(1);
      return capture.brokerEmails;
    };
    expect(await run(false)).toHaveLength(0);
    const sent = await run(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "asha@iitbhu.ac.in", event: "asker_expired", subject: "No one was available this time" });
    expect(sent[0]!.paragraphs[0]).toContain("We asked 6 alumni at Swiggy");
  });

  it("the helper's ask line names the asker and why they were asked", () => {
    const r = { role_title: "Product Manager", job_function: "product", experience_band: "3_7", company: "Swiggy" };
    expect(helperAskLine("referral", "Asha Rao", r)).toBe(
      "Asha Rao is looking for a referral at Swiggy for Product Manager. You're there now, so Alma Mater asked you."
    );
    expect(helperAskLine("hiring", "Asha Rao", r)).toContain("Product Manager · Swiggy · 3–7 yrs");
  });
});

describe("migration 076", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/076_brokered_requests.sql"), "utf8");
  it("lets the database guarantee one yes per request", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_asks_one_accepted ON broker_asks (request_id) WHERE status = 'accepted'");
    expect(sql).toContain("CONSTRAINT broker_asks_one_per_helper UNIQUE (request_id, helper_person_id)");
  });

  it("adds the job function, hiring post fields and the brokered reachout sources", () => {
    expect(sql).toContain("ALTER TABLE people ADD COLUMN IF NOT EXISTS job_function TEXT");
    expect(sql).toContain("hiring_respond_via IN ('reachout', 'link')");
    expect(sql).toContain("'search', 'wall', 'referral_request', 'hiring_request'");
    expect(sql).toContain("source IN ('match', 'whatsapp', 'careers', 'profile', 'search', 'wall', 'referral_request')");
  });

  it("keeps WhatsApp asks behind an admin switch that starts off", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_settings");
    expect(env.BROKER_EMAILS_ENABLED).toBe(false);
  });
});
