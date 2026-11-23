import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  PERSON_AREA_MAX_LENGTH,
  PERSON_AREAS_MAX,
  areaKey,
  escapeLikePattern,
  normalizeAreaLabel,
  normalizePersonAreas
} from "../src/lib/personAreas.js";
import { PersonAreaRepo } from "../src/repos/personAreaRepo.js";
import { AREA_SUGGESTION_LIMIT, PersonAreaService } from "../src/services/personAreaService.js";
import { MatchRepo } from "../src/repos/matchRepo.js";
import { AppError } from "../src/lib/errors.js";
import type { DbExecutor } from "../src/db/types.js";

/** Areas of experience (migration 069): normalising, saving in one step, suggestions, Ask text. */

type Call = { text: string; params: unknown[] };

function fakeClient(opts: { lockRows?: number; failOn?: RegExp; error?: unknown; rows?: Record<string, unknown>[] } = {}) {
  const calls: Call[] = [];
  const release = vi.fn();
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (opts.failOn?.test(text)) throw opts.error;
    if (/FOR UPDATE/.test(text)) return { rows: [], rowCount: opts.lockRows ?? 1 };
    return { rows: opts.rows ?? [], rowCount: (opts.rows ?? []).length };
  });
  return { calls, release, query };
}

function makeService(client: ReturnType<typeof fakeClient>) {
  const pool = { query: client.query, connect: vi.fn(async () => ({ query: client.query, release: client.release })) };
  return new PersonAreaService(pool as unknown as Pool);
}

const statements = (calls: Call[]) => calls.map((c) => c.text.replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" "));

describe("normalizePersonAreas", () => {
  it("trims, collapses spacing, drops blanks and keeps the member's order", () => {
    expect(normalizePersonAreas(["  Pricing ", "", "D2C\t\tgrowth", "   "])).toEqual({
      ok: true,
      areas: ["Pricing", "D2C growth"]
    });
  });

  it("treats different capitalisation as the same area and keeps the first spelling", () => {
    expect(normalizePersonAreas(["Pricing", "pricing", "PRICING ", "Supply chain"])).toEqual({
      ok: true,
      areas: ["Pricing", "Supply chain"]
    });
    expect(areaKey("  Supply   Chain ")).toBe("supply chain");
  });

  it(`refuses an area over ${PERSON_AREA_MAX_LENGTH} characters`, () => {
    expect(normalizePersonAreas(["x".repeat(PERSON_AREA_MAX_LENGTH)])).toEqual({
      ok: true,
      areas: ["x".repeat(PERSON_AREA_MAX_LENGTH)]
    });
    expect(normalizePersonAreas(["x".repeat(PERSON_AREA_MAX_LENGTH + 1)])).toEqual({ ok: false, reason: "too_long" });
  });

  it(`refuses more than ${PERSON_AREAS_MAX} different areas, counting after repeats are removed`, () => {
    const eight = Array.from({ length: 8 }, (_, i) => `Area ${i}`);
    expect(normalizePersonAreas([...eight, "area 0"])).toEqual({ ok: true, areas: eight });
    expect(normalizePersonAreas([...eight, "Area 8"])).toEqual({ ok: false, reason: "too_many" });
  });

  it("escapes LIKE wildcards and normalises suggestion text", () => {
    expect(escapeLikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(normalizeAreaLabel(" pri\n cing ")).toBe("pri cing");
  });
});

describe("PersonAreaService.replaceMyAreas", () => {
  it("locks the member, replaces the whole list and commits, in one transaction", async () => {
    const client = fakeClient();
    const saved = await makeService(client).replaceMyAreas("person-1", [" Pricing", "pricing", "D2C  growth"]);
    expect(saved).toEqual(["Pricing", "D2C growth"]);
    expect(statements(client.calls)).toEqual(["BEGIN", "SELECT 1 FROM", "DELETE FROM person_areas", "INSERT INTO person_areas", "COMMIT"]);
    const insert = client.calls.find((c) => c.text.includes("INSERT INTO person_areas"))!;
    expect(insert.params).toEqual(["person-1", ["Pricing", "D2C growth"]]);
    expect(insert.text).toContain("WITH ORDINALITY");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("an empty list clears the member's areas without inserting", async () => {
    const client = fakeClient();
    expect(await makeService(client).replaceMyAreas("person-1", [])).toEqual([]);
    expect(statements(client.calls)).toEqual(["BEGIN", "SELECT 1 FROM", "DELETE FROM person_areas", "COMMIT"]);
  });

  it("refuses bad lists before touching the database", async () => {
    const client = fakeClient();
    const svc = makeService(client);
    await expect(svc.replaceMyAreas("person-1", ["x".repeat(41)])).rejects.toMatchObject({ code: "AREA_TOO_LONG", statusCode: 400 });
    await expect(svc.replaceMyAreas("person-1", Array.from({ length: 9 }, (_, i) => `A${i}`))).rejects.toMatchObject({
      code: "AREAS_TOO_MANY"
    });
    expect(client.calls).toHaveLength(0);
  });

  it("rolls back and says so when the member no longer exists", async () => {
    const client = fakeClient({ lockRows: 0 });
    await expect(makeService(client).replaceMyAreas("gone", ["Pricing"])).rejects.toBeInstanceOf(AppError);
    expect(statements(client.calls)).toEqual(["BEGIN", "SELECT 1 FROM", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("turns the database's duplicate check into a plain message", async () => {
    const client = fakeClient({ failOn: /INSERT INTO person_areas/, error: { code: "23505" } });
    await expect(makeService(client).replaceMyAreas("person-1", ["Straße", "STRASSE"])).rejects.toMatchObject({
      code: "AREA_DUPLICATE",
      statusCode: 400
    });
    expect(statements(client.calls).at(-1)).toBe("ROLLBACK");
  });
});

describe("area suggestions", () => {
  it("needs two typed characters", async () => {
    const client = fakeClient();
    expect(await makeService(client).suggestAreas(" p ", false)).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it("matches the start of any word, counts only searchable members, most-used first", async () => {
    const calls: Call[] = [];
    const db = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        calls.push({ text, params });
        return { rows: [{ label: "Pricing", member_count: 3 }], rowCount: 1 };
      })
    } as unknown as DbExecutor;
    const result = await new PersonAreaRepo(db).suggest("Pri_", false, AREA_SUGGESTION_LIMIT);
    expect(result).toEqual([{ label: "Pricing", memberCount: 3 }]);
    const { text, params } = calls[0]!;
    expect(params).toEqual(["pri\\_", AREA_SUGGESTION_LIMIT]);
    expect(text).toContain("pa.label_key LIKE $1 || '%' OR pa.label_key LIKE '% ' || $1 || '%'");
    expect(text).toContain("p.deleted_at IS NULL");
    expect(text).toContain("p.suspended_at IS NULL");
    expect(text).toContain("p.profile_completed_at IS NOT NULL");
    expect(text).toContain("ORDER BY member_count DESC");
  });
});

describe("migration 069", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/069_person_areas.sql"), "utf8");

  it("caps length, count and repeats in the schema itself", () => {
    expect(sql).toContain("char_length(label) BETWEEN 1 AND 40");
    expect(sql).toContain("label_key TEXT GENERATED ALWAYS AS (lower(label)) STORED");
    expect(sql).toContain("position BETWEEN 0 AND 7");
    expect(sql).toContain("UNIQUE (person_id, label_key)");
    expect(sql).toContain("UNIQUE (person_id, position)");
    expect(sql).toContain("REFERENCES people(id) ON DELETE CASCADE");
    expect(PERSON_AREAS_MAX).toBe(8);
    expect(PERSON_AREA_MAX_LENGTH).toBe(40);
  });
});

describe("migration 070", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/070_open_to_drop_descriptions.sql"), "utf8");

  it("removes saved per-tag lines from both stored shapes and nothing else", () => {
    expect(sql).toContain("open_to_preferences - 'descriptions'");
    expect(sql).toContain("entry.value - 'description'");
    expect(sql).not.toMatch(/DROP|DELETE FROM|TRUNCATE/i);
  });
});

describe("Ask candidate text", () => {
  it("includes the member's areas next to their jobs", async () => {
    const calls: Call[] = [];
    const query = vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: [], rowCount: 0 };
    });
    // The repo runs its select in a short transaction (statement timeout), so give it a client too.
    const db = { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    await new MatchRepo(db as unknown as ConstructorParameters<typeof MatchRepo>[0]).findCandidates({
      viewerPersonId: "viewer-1",
      viewerIsDemo: false,
      companyPattern: "Swiggy",
      rolePattern: null,
      fromRolePattern: null,
      cityNames: [],
      countryNames: [],
      studyPrograms: [],
      wantStudy: false,
      wantFounder: false,
      keywords: [{ keyword: "pricing", pattern: "pricing" }],
      requiredAnyOf: ["cc"]
    } as unknown as Parameters<MatchRepo["findCandidates"]>[0]);
    const text = calls.map((c) => c.text).join("\n");
    expect(text).toContain("SELECT string_agg(pa.label, ' ') FROM person_areas pa WHERE pa.person_id = p.id");
  });
});
