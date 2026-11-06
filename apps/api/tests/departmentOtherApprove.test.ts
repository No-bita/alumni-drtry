import { describe, expect, it } from "vitest";
import { DepartmentOtherReviewRepo } from "../src/repos/departmentOtherReviewRepo.js";

// Unit test with a fake executor (no database): approval is one conditional statement bound to the reviewed text.
function fakeDb(rowCount: number) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: [], rowCount };
    },
  };
  return { db, calls };
}

describe("DepartmentOtherReviewRepo.approve", () => {
  it("sends the reviewed text as a condition and writes status and history in one statement", async () => {
    const { db, calls } = fakeDb(1);
    const ok = await new DepartmentOtherReviewRepo(db as never).approve("p1", "admin1", "Astrophysics");
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toEqual(["p1", "admin1", "Astrophysics"]);
    expect(calls[0]!.text).toMatch(/UPDATE people[\s\S]*department_other_text = \$3[\s\S]*RETURNING/);
    expect(calls[0]!.text).toMatch(/code = 'other'/);
    expect(calls[0]!.text).toMatch(/INSERT INTO department_other_history[\s\S]*FROM approved/);
  });

  it("returns false when the stored text no longer matches (nothing approved)", async () => {
    const { db, calls } = fakeDb(0);
    expect(await new DepartmentOtherReviewRepo(db as never).approve("p1", "admin1", "Old text")).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("DepartmentOtherReviewRepo.reject and link", () => {
  it("reject binds to the reviewed text and the Other department, one statement with history", async () => {
    const { db, calls } = fakeDb(1);
    expect(await new DepartmentOtherReviewRepo(db as never).reject("p1", "admin1", "Not real", "Astro")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toEqual(["p1", "admin1", "Not real", "Astro"]);
    expect(calls[0]!.text).toMatch(/department_other_text = \$4[\s\S]*code = 'other'[\s\S]*RETURNING/);
    expect(calls[0]!.text).toMatch(/INSERT INTO department_other_history[\s\S]*FROM rejected/);
  });

  it("link binds to the reviewed text and the Other department, one statement with history", async () => {
    const { db, calls } = fakeDb(1);
    expect(await new DepartmentOtherReviewRepo(db as never).link("p1", "admin1", "d1", "Astro")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toEqual(["p1", "d1", "admin1", "Astro"]);
    expect(calls[0]!.text).toMatch(/department_other_text = \$4[\s\S]*code = 'other'[\s\S]*RETURNING/);
    expect(calls[0]!.text).toMatch(/INSERT INTO department_other_history[\s\S]*target_department_id[\s\S]*FROM linked/);
  });

  it("reject and link return false when nothing matched", async () => {
    const { db } = fakeDb(0);
    const repo = new DepartmentOtherReviewRepo(db as never);
    expect(await repo.reject("p1", "a", "r", "old")).toBe(false);
    expect(await repo.link("p1", "a", "d1", "old")).toBe(false);
  });
});
