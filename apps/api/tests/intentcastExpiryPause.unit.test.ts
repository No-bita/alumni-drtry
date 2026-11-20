import { describe, expect, it, vi } from "vitest";
import { IntentcastRepo } from "../src/repos/intentcastRepo.js";
import { IntentcastService } from "../src/services/intentcastService.js";
import { AppError } from "../src/lib/errors.js";
import type { DbExecutor } from "../src/db/types.js";

/**
 * Post expiry pause (user request, 2026-11-21). The expiry UPDATE in
 * IntentcastRepo.expireOpenIntentcasts and the expires_at feed predicates are
 * commented out, not deleted. These tests pin the paused behavior so the pause
 * cannot silently regress, and so re-enabling later is a deliberate diff.
 */

type QueryCall = { text: string; params: unknown[] };

const makeDb = (rows: Record<string, unknown>[] = []) => {
  const calls: QueryCall[] = [];
  const db = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
    })
  };
  return { db: db as unknown as DbExecutor, calls };
};

/** Remove `--` line comments so commented-out predicates don't trip string assertions. */
const activeSql = (sql: string): string =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

const pastExpiryFeedRow = {
  id: "ic-1",
  author_person_id: "author-1",
  author_full_name: "Asha Rao",
  author_department_code: "cse",
  author_department_name: "Computer Science",
  author_batch_year: 2020,
  author_current_role_title: null,
  author_current_organization_name: null,
  content: "Hiring for a backend role at a fintech startup.",
  category: "hiring",
  kind: null,
  status: "open",
  expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // already past
  closed_at: null,
  closed_reason: null,
  created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  editable_until: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  author_soft_deleted_at: null,
  author_delete_purge_at: null,
  response_count: 0,
  viewer_has_responded: false,
  author_is_demo: false
};

describe("intentcast expiry pause (commented out, not deleted)", () => {
  it("expireOpenIntentcasts is a no-op: returns 0 and issues no UPDATE", async () => {
    const { db, calls } = makeDb();
    const repo = new IntentcastRepo(db);
    await expect(repo.expireOpenIntentcasts()).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("create() still records expires_at on new posts (written but inert)", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { db, calls } = makeDb([{ id: "ic-new" }]);
    const repo = new IntentcastRepo(db);
    await repo.create({
      authorPersonId: "author-1",
      content: "Hiring for a backend role at a fintech startup.",
      category: "hiring",
      kind: null,
      expiresAt,
      placeId: null
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain("expires_at");
    expect(calls[0]!.params[4]).toBe(expiresAt);
  });

  it("public feed no longer filters open posts by expires_at", async () => {
    const { db, calls } = makeDb([]);
    const repo = new IntentcastRepo(db);
    await repo.listFeed({ viewerPersonId: "viewer-1", limit: 10, offset: 0 });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const sql = activeSql(call.text);
      expect(sql).not.toContain("i.expires_at > now()");
      // status filter is intentionally unchanged: already-closed/expired rows stay hidden.
      expect(sql).toContain("i.status =");
    }
  });

  it("detail view still returns an open post whose expires_at has passed", async () => {
    const { db, calls } = makeDb([pastExpiryFeedRow]);
    const repo = new IntentcastRepo(db);
    const view = await repo.findFeedItemVisibleToViewer("ic-1", "viewer-1");
    expect(view).not.toBeNull();
    expect(view!.status).toBe("open");
    const sql = activeSql(calls[0]!.text);
    expect(sql).not.toContain("i.expires_at > now()");
    expect(sql).toContain("i.status = 'open'");
  });

  it("replies still work on an open post past expires_at; closed posts still reject replies", async () => {
    const openPastExpiry = {
      id: "ic-1",
      author_person_id: "author-1",
      content: "Hiring for a backend role at a fintech startup.",
      status: "open",
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      author_soft_deleted_at: null
    };
    const responseView = {
      id: "resp-1",
      intentcastId: "ic-1",
      responderPersonId: "viewer-1",
      responderFullName: "Ravi Kumar",
      responderDepartmentCode: "cse",
      responderDepartmentName: "Computer Science",
      message: "I am interested in this role.",
      createdAt: new Date(),
      responderIsDemo: false
    };

    const makeService = (intentcast: Record<string, unknown>) => {
      const svc = Object.create(IntentcastService.prototype) as IntentcastService;
      const internals = svc as unknown as Record<string, unknown>;
      internals.intentcastRepo = {
        expireOpenIntentcasts: vi.fn(async () => 0),
        purgeAuthorSoftDeletedIntentcasts: vi.fn(async () => 0),
        findById: vi.fn(async () => intentcast),
        createResponse: vi.fn(async () => ({})),
        listResponsesForIntentcast: vi.fn(async () => [responseView])
      };
      internals.sendResponseEmail = vi.fn(async () => undefined);
      return svc;
    };

    // Open but past expires_at: reply must succeed (expiry no longer closes anything).
    await expect(
      makeService(openPastExpiry).respondToIntentcast("viewer-1", "ic-1", {
        message: "I am interested in this role."
      })
    ).resolves.toMatchObject({ id: "resp-1" });

    // Manually closed: reply must still be rejected (manual close unchanged).
    const closed = { ...openPastExpiry, status: "closed" };
    await expect(
      makeService(closed).respondToIntentcast("viewer-1", "ic-1", {
        message: "I am interested in this role."
      })
    ).rejects.toMatchObject({ code: "INTENTCAST_NOT_OPEN" } satisfies Partial<AppError>);
  });
});
