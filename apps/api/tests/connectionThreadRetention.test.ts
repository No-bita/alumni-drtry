import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionThreadService } from "../src/services/connectionThreadService.js";
import {
  ConnectionThreadRepo,
  type ConnectionMessageView,
  type ConnectionThreadRow
} from "../src/repos/connectionThreadRepo.js";
import type { PersonRow } from "../src/repos/personRepo.js";
import type { EmailSender } from "../src/services/emailSender.js";

const THREAD_ID = "11111111-1111-1111-1111-111111111111";
const VIEWER_ID = "22222222-2222-2222-2222-222222222222";
const COUNTERPARTY_ID = "33333333-3333-3333-3333-333333333333";

function makePerson(id: string, overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id,
    institutional_email: `${id}@iitbhu.ac.in`,
    role: "alumni",
    is_test_user: false,
    is_demo: false,
    full_name: `Person ${id.slice(0, 4)}`,
    department_code: "cse",
    department_name: "Computer Science and Engineering",
    department_id: null,
    degree_id: null,
    batch_year: 2020,
    personal_email: null,
    mobile_phone: null,
    bio: null,
    skills_text: null,
    residence_country: null,
    residence_city: null,
    profile_completed_at: new Date("2024-01-01T00:00:00Z"),
    suspended_at: null,
    deleted_at: null,
    joining_year: 2016,
    app_login_count: 1,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides
  };
}

function makeThread(status: ConnectionThreadRow["status"]): ConnectionThreadRow {
  return {
    id: THREAD_ID,
    initiator_person_id: VIEWER_ID,
    recipient_person_id: COUNTERPARTY_ID,
    status,
    kind: "general",
    created_at: new Date("2026-09-01T00:00:00Z"),
    updated_at: new Date("2026-09-01T00:00:00Z")
  };
}

function makeMessage(id: string, createdAt: Date): ConnectionMessageView {
  return {
    id,
    threadId: THREAD_ID,
    authorPersonId: VIEWER_ID,
    body: `Message ${id}`,
    createdAt,
    editedAt: null,
    replyTo: null,
    authorIsDemo: false
  };
}

describe("ConnectionThreadService message retention", () => {
  let service: ConnectionThreadService;
  let mockPool: any;
  let threadRepo: ConnectionThreadRepo;
  let personRepo: any;
  let linkRepo: any;

  function setupThreadView(thread: ConnectionThreadRow, messages: ConnectionMessageView[]): void {
    vi.spyOn(threadRepo, "assertParticipant").mockResolvedValue(thread);
    vi.spyOn(threadRepo, "listMessages").mockResolvedValue(messages);
    vi.spyOn(threadRepo, "listDisclosures").mockResolvedValue([]);
    vi.spyOn(threadRepo, "countMessages").mockResolvedValue(messages.length);
    vi.spyOn(threadRepo, "getNudgeDismissal").mockResolvedValue(null);
    vi.spyOn(threadRepo, "countMessagesByAuthor").mockResolvedValue(0);
    vi.spyOn(threadRepo, "hasDisclosureFromPerson").mockResolvedValue(false);
    vi.spyOn(personRepo, "findById").mockImplementation(async (id: string) => makePerson(id));
    vi.spyOn(personRepo, "findProfileById").mockResolvedValue(null);
    vi.spyOn(linkRepo, "listByPerson").mockResolvedValue([]);
  }

  beforeEach(() => {
    mockPool = { query: vi.fn(), connect: vi.fn() };
    service = new ConnectionThreadService(mockPool, {} as EmailSender);
    threadRepo = (service as any).threadRepo;
    personRepo = (service as any).personRepo;
    linkRepo = (service as any).linkRepo;
  });

  it("returns messages older than five days in full and exposes no deletion warning", async () => {
    const thirtyDaysAgo = makeMessage("m-1", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const tenDaysAgo = makeMessage("m-2", new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
    setupThreadView(makeThread("open"), [thirtyDaysAgo, tenDaysAgo]);

    const detail = await service.getThreadDetail(VIEWER_ID, THREAD_ID);

    expect(detail.messages.map((m) => m.id)).toEqual(["m-1", "m-2"]);
    expect("messagesDeletionWarning" in detail).toBe(false);
  });

  it.each(["closed", "declined"] as const)(
    "keeps the full message history readable after a thread is %s",
    async (status) => {
      const messages = [
        makeMessage("m-1", new Date("2026-09-02T00:00:00Z")),
        makeMessage("m-2", new Date("2026-09-03T00:00:00Z"))
      ];
      setupThreadView(makeThread(status), messages);

      const detail = await service.getThreadDetail(VIEWER_ID, THREAD_ID);

      expect(detail.thread.status).toBe(status);
      expect(detail.messages.map((m) => m.id)).toEqual(["m-1", "m-2"]);
    }
  );

  it("closeThread changes only the thread status and deletes nothing", async () => {
    vi.spyOn(threadRepo, "assertParticipant").mockResolvedValue(makeThread("open"));
    vi.spyOn(threadRepo, "findById").mockResolvedValue(makeThread("open"));
    const setStatus = vi.spyOn(threadRepo, "setThreadStatus").mockResolvedValue(undefined);

    await service.closeThread(VIEWER_ID, THREAD_ID, "declined");

    expect(setStatus).toHaveBeenCalledWith(THREAD_ID, "declined");
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("ConnectionThreadRepo exposes no message purge path", () => {
    expect(
      (ConnectionThreadRepo.prototype as unknown as Record<string, unknown>).purgeExpiredMessages
    ).toBeUndefined();
  });
});
