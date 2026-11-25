import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import {
  BROKER_CONVERSATION_INACTIVE_DAYS,
  BROKER_CONVERSATION_MAX_MESSAGES,
  BROKER_MESSAGE_MAX_CHARS,
  BROKER_MESSAGE_MAX_UNANSWERED,
  BROKER_MESSAGE_RATE_WINDOW_MINUTES,
  BROKER_MESSAGES_PER_WINDOW,
  BrokerConversationService,
  normalizeBrokerMessage,
  readOnlyReason
} from "../src/services/brokerConversationService.js";
import { TestCaptureEmailSender } from "../src/services/emailSender.js";

/** Brokered conversations (migration 079): the limits, as pure rules, and the one-nudge email. */

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const REQ = "44444444-4444-4444-8444-444444444444";
const DAY = 86_400_000;

afterEach(() => {
  (env as { BROKER_EMAILS_ENABLED: boolean }).BROKER_EMAILS_ENABLED = false;
});

describe("limits (defaults the owner can tune)", () => {
  it("are named constants with the agreed defaults", () => {
    expect({
      BROKER_MESSAGE_MAX_CHARS,
      BROKER_MESSAGES_PER_WINDOW,
      BROKER_MESSAGE_RATE_WINDOW_MINUTES,
      BROKER_MESSAGE_MAX_UNANSWERED,
      BROKER_CONVERSATION_INACTIVE_DAYS,
      BROKER_CONVERSATION_MAX_MESSAGES
    }).toEqual({
      BROKER_MESSAGE_MAX_CHARS: 1000,
      BROKER_MESSAGES_PER_WINDOW: 10,
      BROKER_MESSAGE_RATE_WINDOW_MINUTES: 10,
      BROKER_MESSAGE_MAX_UNANSWERED: 5,
      BROKER_CONVERSATION_INACTIVE_DAYS: 14,
      BROKER_CONVERSATION_MAX_MESSAGES: 200
    });
  });
});

describe("a message is plain text", () => {
  it("is trimmed, keeps line breaks and links as typed, and loses control characters", () => {
    expect(normalizeBrokerMessage("  hi\r\nthere\u0007 https://jobs.example.com/1  ")).toBe("hi\nthere https://jobs.example.com/1");
    expect(normalizeBrokerMessage("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("is never empty, never over the limit, never anything but a string", () => {
    expect(() => normalizeBrokerMessage(" \n\t ")).toThrow(expect.objectContaining({ code: "BROKER_MESSAGE_EMPTY" }));
    expect(() => normalizeBrokerMessage("x".repeat(BROKER_MESSAGE_MAX_CHARS + 1))).toThrow(expect.objectContaining({ code: "BROKER_MESSAGE_TOO_LONG" }));
    expect(normalizeBrokerMessage(` ${"x".repeat(BROKER_MESSAGE_MAX_CHARS)} `)).toHaveLength(BROKER_MESSAGE_MAX_CHARS);
    expect(() => normalizeBrokerMessage({ url: "x" })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe("when a conversation is read-only", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const t = (over: Partial<Parameters<typeof readOnlyReason>[0]> = {}) => ({
    status: "open" as const,
    closed_by_person_id: null,
    created_at: new Date(now - DAY),
    last_message_at: null,
    message_count: 0,
    ...over
  });

  it("open while both are here, it's recent and not full", () => {
    expect(readOnlyReason(t(), ME, false, now)).toBeNull();
  });

  it("closed by either person, telling each which", () => {
    expect(readOnlyReason(t({ status: "closed", closed_by_person_id: ME }), ME, false, now)).toBe("closed_by_you");
    expect(readOnlyReason(t({ status: "closed", closed_by_person_id: THEM }), ME, false, now)).toBe("closed_by_them");
  });

  it("after the quiet period, counted from the last message (or from the yes)", () => {
    const quiet = BROKER_CONVERSATION_INACTIVE_DAYS * DAY;
    expect(readOnlyReason(t({ created_at: new Date(now - quiet) }), ME, false, now)).toBe("inactive");
    expect(readOnlyReason(t({ created_at: new Date(now - quiet - DAY), last_message_at: new Date(now - DAY) }), ME, false, now)).toBeNull();
    expect(readOnlyReason(t({ created_at: new Date(now - 30 * DAY), last_message_at: new Date(now - quiet) }), ME, false, now)).toBe("inactive");
  });

  it("when the other person left, or the conversation is full", () => {
    expect(readOnlyReason(t(), ME, true, now)).toBe("unavailable");
    expect(readOnlyReason(t({ message_count: BROKER_CONVERSATION_MAX_MESSAGES }), ME, false, now)).toBe("limit");
  });
});

describe("the message email", () => {
  type Handler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } | undefined;
  function fakePool(handler: Handler) {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [], rowCount: 0 };
      const out = handler(sql, params) ?? { rows: [] };
      return { rows: out.rows, rowCount: out.rowCount ?? out.rows.length };
    });
    return { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) };
  }
  const pool = (theyHaveUnread: number) =>
    fakePool((sql, params) => {
      if (sql.includes("FROM connection_threads t") && sql.includes("broker_request_id = $1")) {
        return {
          rows: [
            { id: "t1", broker_request_id: REQ, initiator_person_id: ME, recipient_person_id: THEM, status: "open", closed_by_person_id: null, closed_at: null, created_at: new Date(), last_message_at: null, message_count: 0 }
          ]
        };
      }
      if (sql.includes("FROM people p LEFT JOIN departments")) {
        const id = params[0] as string;
        return { rows: [{ id, full_name: id === ME ? "Asha Rao" : "Vikram Iyer", department_code: "cse", batch_year: 2019, unavailable: false, institutional_email: id === ME ? "asha@iitbhu.ac.in" : "vikram@iitbhu.ac.in" }] };
      }
      if (sql.includes("SELECT author_person_id FROM connection_messages")) return { rows: [] };
      if (sql.includes("count(*)::int AS n, min(m.created_at)")) return { rows: [{ n: 0, oldest: null }] };
      if (sql.includes("LEFT JOIN connection_thread_reads rd")) return { rows: [{ n: theyHaveUnread }] };
      if (sql.includes("INSERT INTO connection_messages")) return { rows: [{ id: "m1", author_person_id: ME, body: params[2], created_at: new Date() }] };
      if (sql.includes("FROM broker_requests WHERE id")) return { rows: [{ kind: "referral", company: "Swiggy", job_function: "product", experience_band: "3_7", role_title: "PM", job_url: null, message: "m", details: null }] };
      return undefined;
    });

  it("stays off by default; when on, one nudge per unread run, with no message text or contact", async () => {
    const off = new TestCaptureEmailSender();
    await new BrokerConversationService(pool(0) as never, off).send(ME, REQ, "hello");
    expect(off.brokerEmails).toHaveLength(0);

    (env as { BROKER_EMAILS_ENABLED: boolean }).BROKER_EMAILS_ENABLED = true;
    const first = new TestCaptureEmailSender();
    await new BrokerConversationService(pool(0) as never, first).send(ME, REQ, "my number is 98000 00000");
    expect(first.brokerEmails).toHaveLength(1);
    expect(first.brokerEmails[0]).toMatchObject({ to: "vikram@iitbhu.ac.in", event: "message_received", subject: "Asha Rao sent you a message" });
    expect(first.brokerEmails[0]!.ctaUrl).toContain(`/requests/${REQ}/conversation`);
    expect(JSON.stringify(first.brokerEmails[0])).not.toContain("98000");

    const again = new TestCaptureEmailSender();
    await new BrokerConversationService(pool(1) as never, again).send(ME, REQ, "and another thing");
    expect(again.brokerEmails).toHaveLength(0);
  });
});

describe("migration 079", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/079_broker_conversations.sql"), "utf8");

  it("lets a brokered yes carry no contact, and only a brokered one", () => {
    expect(sql).toContain("recipient_contact_shared IS NOT NULL OR source IN ('referral_request', 'hiring_request')");
  });

  it("reuses connection threads: one per request, a kind of its own, read state, row-level security", () => {
    expect(sql).toContain("CHECK (kind IN ('general', 'referral', 'broker'))");
    expect(sql).toContain("CHECK ((kind = 'broker') = (broker_request_id IS NOT NULL))");
    expect(sql).toContain("uq_connection_threads_broker_request");
    expect(sql).toContain("ALTER TABLE connection_thread_reads ENABLE ROW LEVEL SECURITY");
  });

  it("gives requests that already connected their conversation", () => {
    expect(sql).toMatch(/INSERT INTO connection_threads[\s\S]*'broker'[\s\S]*ba\.status = 'accepted'/);
  });
});
