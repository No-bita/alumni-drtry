import { describe, expect, it } from "vitest";
import { requestRows, rowFromAsk, rowFromInbox } from "../src/lib/requestsForYou";
import type { BrokerAsk } from "../src/lib/broker";
import type { ContactRequestInboxItem } from "../src/api/client";

const asker = { personId: "p1", fullName: "Raghav Gupta", institutionName: "IIM Ahmedabad", batchYear: 2020, departmentCode: null };
const ask = (over: Partial<BrokerAsk> = {}): BrokerAsk =>
  ({
    askId: "a1", requestId: "r1", kind: "hiring", status: "asked", requestStatus: "open", askedAt: "2026-11-24T10:00:00Z", expiresAt: "2026-11-26T10:00:00Z",
    seenAt: null, company: "Acme", jobFunction: "engineering", experienceBand: null, roleTitle: "Backend Engineer", jobUrl: null, message: "We're hiring.",
    details: null, asker, conversation: null, ...over,
  }) as BrokerAsk;
const inbox = (over: Partial<ContactRequestInboxItem> = {}): ContactRequestInboxItem => ({
  id: "c1", senderPersonId: "p2", senderFullName: "Neha Singh", senderDepartmentCode: null, senderInstitutionName: null, senderBatchYear: 2019,
  message: "Hi!", details: null, createdAt: "2026-11-25T10:00:00Z", ...over,
});

describe("Requests for you rows", () => {
  it("titles say what is asked", () => {
    expect(rowFromAsk(ask()).title).toBe("Hiring: Backend Engineer at Acme");
    expect(rowFromAsk(ask({ kind: "referral", roleTitle: null, jobFunction: "product" })).title).toBe("Referral for Product role at Acme");
    expect(rowFromInbox(inbox({ details: { purpose: "referral", jobUrl: "https://j.example.com/1", role: "PM", company: "Meesho", fit: "fit", resumeUrl: "https://cv.example.com" } }))).toMatchObject({
      title: "Referral for PM at Meesho",
      label: "Referral request",
      links: [
        { label: "View job description", sub: "Meesho · PM", href: "https://j.example.com/1" },
        { label: "View résumé", sub: null, href: "https://cv.example.com" },
      ],
    });
    expect(rowFromInbox(inbox()).title).toBe("Hi!");
    expect(rowFromInbox(inbox()).label).toBe("Reachout");
  });

  it("waiting requests first, newest first; asks you already said yes to after; declined ones never", () => {
    const rows = requestRows(
      [ask({ askId: "old", askedAt: "2026-11-20T10:00:00Z" }), ask({ askId: "yes", status: "accepted", askedAt: "2026-11-25T12:00:00Z" }), ask({ askId: "no", status: "declined" })],
      [inbox()],
    );
    expect(rows.map((r) => r.key)).toEqual(["note:c1", "ask:old", "ask:yes"]);
    expect(rows.map((r) => r.pending)).toEqual([true, true, false]);
  });
});
