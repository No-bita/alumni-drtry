import { describe, expect, it } from "vitest";
import { CitiesRepo } from "../src/repos/citiesRepo.js";
import { sharedTag } from "../src/services/citiesService.js";
import type { DbExecutor } from "../src/db/types.js";
describe("Cities helper company tag", () => {
  it("leaves company comparison unknown for viewer-independent person cards", async () => {
    let sql = "";
    const db = { query: async (query: string) => { sql = query; return { rows: [] }; } } as unknown as DbExecutor;
    await new CitiesRepo(db).personCards(["person"]);
    expect(sql).toContain("NULL::boolean AS same_company");
  });
  it("falls back to matching company names, but honors an explicit non-match", () => {
    const viewer = { batchYear: 2000, departmentCode: "cse", companyName: "Acme" } as Parameters<typeof sharedTag>[1];
    const person = { batch_year: 2020, department_code: "mech", org_name: " acme ", same_company: null };
    expect(sharedTag(person, viewer)).toBe("Also at Acme");
    expect(sharedTag({ ...person, same_company: false }, viewer)).toBeNull();
    expect(sharedTag({ ...person, org_name: "Other" }, viewer)).toBeNull();
  });
});
