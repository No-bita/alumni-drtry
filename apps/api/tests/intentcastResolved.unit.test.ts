import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { INTENTCAST_RESOLVED_OUTCOMES, IntentcastRepo } from "../src/repos/intentcastRepo.js";
import { IntentcastService } from "../src/services/intentcastService.js";
import { AppError } from "../src/lib/errors.js";
import type { DbExecutor } from "../src/db/types.js";

/** Business progress steps (option A2, migration 068): an author closes their request as resolved. */

const makeDb = (rows: Record<string, unknown>[] = [{ id: "ic-1" }]) => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows, rowCount: rows.length, command: "UPDATE", oid: 0, fields: [] };
    })
  };
  return { db: db as unknown as DbExecutor, calls };
};

const openPost = { id: "ic-1", author_person_id: "author-1", status: "open", author_soft_deleted_at: null };

function makeService(post: Record<string, unknown> | null = openPost) {
  const svc = Object.create(IntentcastService.prototype) as IntentcastService;
  const repo = {
    expireOpenIntentcasts: vi.fn(async () => 0),
    purgeAuthorSoftDeletedIntentcasts: vi.fn(async () => 0),
    findById: vi.fn(async () => post),
    closeManually: vi.fn(async () => ({ id: "ic-1" })),
    closeResolved: vi.fn(async () => ({ id: "ic-1" }))
  };
  (svc as unknown as Record<string, unknown>).intentcastRepo = repo;
  return { svc, repo };
}

describe("resolved outcomes", () => {
  it("are exactly the three the author can pick", () => {
    expect(INTENTCAST_RESOLVED_OUTCOMES).toEqual(["got_help_here", "sorted_elsewhere", "no_longer_needed"]);
  });

  it("the migration allows the same three, and only together with closed_reason 'resolved'", () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/068_intentcast_resolved.sql"), "utf8");
    for (const o of INTENTCAST_RESOLVED_OUTCOMES) expect(sql).toContain(`'${o}'`);
    expect(sql).toContain("'moderated', 'resolved'");
    expect(sql).toContain("(COALESCE(closed_reason, '') = 'resolved') = (resolved_outcome IS NOT NULL)");
  });
});

describe("IntentcastRepo.closeResolved", () => {
  it("closes only the author's own open post, as resolved with the outcome", async () => {
    const { db, calls } = makeDb();
    const row = await new IntentcastRepo(db).closeResolved("ic-1", "author-1", "got_help_here");
    expect(row).toEqual({ id: "ic-1" });
    const sql = calls[0]!.text;
    expect(sql).toContain("closed_reason = 'resolved'");
    expect(sql).toContain("resolved_outcome = $3");
    expect(sql).toContain("author_person_id = $2");
    expect(sql).toContain("status = 'open'");
    expect(sql).toContain("author_soft_deleted_at IS NULL");
    expect(calls[0]!.params).toEqual(["ic-1", "author-1", "got_help_here"]);
  });

  it("returns null when nothing matched (already closed, or not the author's)", async () => {
    const { db } = makeDb([]);
    expect(await new IntentcastRepo(db).closeResolved("ic-1", "author-1", "no_longer_needed")).toBeNull();
  });
});

describe("IntentcastService.closeIntentcast", () => {
  it("with an outcome closes as resolved; without one it is the plain close, as before", async () => {
    const a = makeService();
    await a.svc.closeIntentcast("author-1", "ic-1", "sorted_elsewhere");
    expect(a.repo.closeResolved).toHaveBeenCalledWith("ic-1", "author-1", "sorted_elsewhere");
    expect(a.repo.closeManually).not.toHaveBeenCalled();

    const b = makeService();
    await b.svc.closeIntentcast("author-1", "ic-1");
    expect(b.repo.closeManually).toHaveBeenCalledWith("ic-1", "author-1");
    expect(b.repo.closeResolved).not.toHaveBeenCalled();
  });

  it("keeps the existing guards: only the author, only an open post", async () => {
    await expect(makeService().svc.closeIntentcast("someone-else", "ic-1", "got_help_here")).rejects.toMatchObject({
      statusCode: 403,
      code: "INTENTCAST_FORBIDDEN"
    });
    await expect(
      makeService({ ...openPost, status: "closed" }).svc.closeIntentcast("author-1", "ic-1", "got_help_here")
    ).rejects.toBeInstanceOf(AppError);
    await expect(makeService(null).svc.closeIntentcast("author-1", "ic-1", "got_help_here")).rejects.toMatchObject({
      statusCode: 404
    });
  });
});
