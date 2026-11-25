import { describe, expect, it, vi } from "vitest";
import { IntentcastRepo } from "../src/repos/intentcastRepo.js";
import type { DbExecutor } from "../src/db/types.js";

/** "Opportunities for you" (Home Wall, sort=for_you): what the feed query asks the database for. */

const VIEWER = "00000000-0000-4000-8000-000000000001";

const captureFeedSql = async (input: Partial<Parameters<IntentcastRepo["listFeed"]>[0]>) => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    })
  } as unknown as DbExecutor;
  await new IntentcastRepo(db).listFeed({ viewerPersonId: VIEWER, limit: 48, offset: 0, excludeAuthorSoftDeleted: true, ...input });
  return calls[0]!;
};

describe("Home Wall: Opportunities for you", () => {
  it("leaves out the viewer's own posts and ranks in tiers after pins", async () => {
    const { text } = await captureFeedSql({ homeWall: true, forYou: true });
    expect(text).toMatch(/i\.author_person_id <> \$\d+::uuid/);
    const order = text.slice(text.indexOf("ORDER BY"));
    // Pins first, then the tiers, then newest first.
    expect(order.indexOf("wall_pinned_at DESC NULLS LAST")).toBeLessThan(order.indexOf("THEN 1"));
    expect(order).toContain("i.hiring_function = vp.job_function");
    expect(order).toContain("ELSE 3");
    expect(order.indexOf("ELSE 3")).toBeLessThan(order.indexOf("i.created_at DESC"));
    // The unanswered-and-recent boost belongs to the default order only.
    expect(order).not.toContain("interval '48 hours'");
  });

  it("matches tier 2 by referral company, Open to and areas", async () => {
    const { text } = await captureFeedSql({ homeWall: true, forYou: true });
    expect(text).toContain(") v_co ON TRUE");
    expect(text).toContain("looking for referral for .* at (.+)$");
    expect(text).toContain("?| ARRAY['mentorship', 'advising']::text[]");
    expect(text).toContain("?| ARRAY['advising', 'collaboration']::text[]");
    expect(text).toContain("FROM person_areas pa");
  });

  it("keeps the default Wall order when for-you is not asked for", async () => {
    const { text } = await captureFeedSql({ homeWall: true });
    expect(text).not.toContain("author_person_id <>");
    expect(text).not.toContain("v_co");
    expect(text).toContain("interval '48 hours'");
  });

  it("ignores for-you outside the shared Home Wall", async () => {
    const mine = await captureFeedSql({ forYou: true, mine: true });
    expect(mine.text).not.toContain("author_person_id <>");
    const careers = await captureFeedSql({ forYou: true });
    expect(careers.text).not.toContain("v_co");
  });
});
