import { describe, expect, it } from "vitest";
import {
  audienceLabel,
  audienceParts,
  audienceVisibleSql,
  buildAudienceSnapshot,
  institutionForEmail,
  institutionKey,
  isEveryone,
  listInstitutions,
  roundAudienceSize,
  type AuthorAudienceFacts
} from "../src/lib/postAudience.js";

const allowed = new Set(["iitbhu.ac.in", "itbhu.ac.in", "iitb.ac.in", "iitbombay.org", "iima.ac.in", "iitg.ac.in", "iitgn.ac.in"]);
const institutions = listInstitutions(allowed);

const facts = (over: Partial<AuthorAudienceFacts> = {}): AuthorAudienceFacts => ({
  batchYear: 2025,
  departmentCode: "mst",
  departmentName: "Materials Science and Engineering",
  departmentUnavailable: null,
  placeId: "11111111-1111-1111-1111-111111111111",
  placeName: "Bengaluru",
  placeUnavailable: null,
  ...over
});

describe("institutes", () => {
  it("groups every allowed domain under its institute, in directory order", () => {
    expect(institutions.map((i) => i.name)).toEqual([
      "IIT (BHU) Varanasi",
      "IIT Bombay",
      "IIM Ahmedabad",
      "IIT Guwahati",
      "IIT Gandhinagar"
    ]);
    expect(institutions.find((i) => i.name === "IIT Bombay")!.domains).toEqual(["iitb.ac.in", "iitbombay.org"]);
    expect(institutions.find((i) => i.name === "IIT (BHU) Varanasi")!.domains).toEqual(["iitbhu.ac.in", "itbhu.ac.in"]);
  });
  it("leaves out institutes whose domains are not allowed", () => {
    expect(listInstitutions(new Set(["iitbhu.ac.in"])).map((i) => i.name)).toEqual(["IIT (BHU) Varanasi"]);
  });
  it("keys are stable slugs", () => {
    expect(institutionKey("IIT (BHU) Varanasi")).toBe("iit-bhu-varanasi");
  });
  it("finds the author's own institute from their email", () => {
    expect(institutionForEmail("a.b@iitbombay.org", institutions)?.name).toBe("IIT Bombay");
    expect(institutionForEmail("a@gmail.com", institutions)).toBeNull();
  });
});

describe("building the stored audience", () => {
  it("nothing picked is Everyone (the default), including institute = all", () => {
    for (const input of [null, undefined, {}, { institution: null }, { batch: false, city: false }]) {
      const r = buildAudienceSnapshot(input, facts(), institutions);
      expect(r.ok && isEveryone(r.snapshot)).toBe(true);
    }
  });
  it("any allowed institute can be picked, with all of its domains", () => {
    const r = buildAudienceSnapshot({ institution: "iit-bombay" }, facts(), institutions);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot.emailDomains).toEqual(["iitb.ac.in", "iitbombay.org"]);
      expect(r.snapshot.institutionName).toBe("IIT Bombay");
      expect(r.parts).toEqual(["institution"]);
    }
  });
  it("batch, department and city copy the AUTHOR's own values", () => {
    const r = buildAudienceSnapshot({ batch: true, department: true, city: true }, facts(), institutions);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot).toMatchObject({ batchYear: 2025, departmentCode: "mst", placeId: "11111111-1111-1111-1111-111111111111", emailDomains: null });
      expect(r.parts).toEqual(["batch", "department", "city"]);
    }
  });
  it("refuses an unknown institute", () => {
    expect(buildAudienceSnapshot({ institution: "nowhere" }, facts(), institutions)).toEqual({ ok: false, reason: "unknown_institution" });
  });
  it("refuses details the author doesn't have, naming each", () => {
    const r = buildAudienceSnapshot(
      { batch: true, department: true, city: true },
      facts({ batchYear: null, departmentCode: null, departmentUnavailable: "pending_review", placeId: null, placeUnavailable: "city_not_linked" }),
      institutions
    );
    expect(r).toEqual({ ok: false, reason: "detail_missing", missing: ["batch", "department", "city"] });
  });
  it("never stores an 'other' department", () => {
    const r = buildAudienceSnapshot({ department: true }, facts({ departmentCode: "other" }), institutions);
    expect(r).toEqual({ ok: false, reason: "detail_missing", missing: ["department"] });
  });
});

describe("label and parts", () => {
  it("joins the picked parts in a fixed order", () => {
    expect(audienceLabel({ institutionName: "IIT (BHU) Varanasi", batchYear: 2025, departmentName: "Materials Science", placeName: "Bengaluru" }))
      .toBe("IIT (BHU) Varanasi · 2025 batch · Materials Science · Bengaluru");
    expect(audienceLabel({ institutionName: null, batchYear: null, departmentName: null, placeName: "Pune" })).toBe("Pune");
    expect(audienceLabel({ institutionName: null, batchYear: null, departmentName: null, placeName: null })).toBeNull();
  });
  it("parts follow what is stored", () => {
    expect(audienceParts({ emailDomains: ["x"], batchYear: null, departmentCode: null, placeId: "p" })).toEqual(["institution", "city"]);
  });
});

describe("rounded size", () => {
  it("never shows an exact count", () => {
    expect(roundAudienceSize(0)).toEqual({ size: "none" });
    expect(roundAudienceSize(1)).toEqual({ size: "under10" });
    expect(roundAudienceSize(9)).toEqual({ size: "under10" });
    expect(roundAudienceSize(10)).toEqual({ size: "about", approx: 10 });
    expect(roundAudienceSize(99)).toEqual({ size: "about", approx: 90 });
    expect(roundAudienceSize(100)).toEqual({ size: "about", approx: 100 });
    expect(roundAudienceSize(999)).toEqual({ size: "about", approx: 950 });
    expect(roundAudienceSize(1000)).toEqual({ size: "about", approx: 1000 });
    expect(roundAudienceSize(1234)).toEqual({ size: "about", approx: 1200 });
  });
});

describe("visibility rule", () => {
  it("always lets the author through and checks all four stored parts", () => {
    const sql = audienceVisibleSql("i", "vp");
    expect(sql).toContain("i.author_person_id = vp.id");
    for (const col of ["audience_email_domains", "audience_batch_year", "audience_department_code", "audience_place_id"]) {
      expect(sql).toContain(`i.${col} IS NULL`);
    }
    expect(sql).toContain("combined_into_place_id");
  });
});

describe("read-path guard", () => {
  it("every file that reads Wall posts is a reviewed one (add new readers here only after applying the audience rule)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const full = path.join(dir, f);
        return statSync(full).isDirectory() ? (f === "migrations" ? [] : walk(full)) : full.endsWith(".ts") ? [full] : [];
      });
    const readers = walk(root)
      .filter((f) => /(FROM|JOIN)\s+intentcasts\b|`intentcasts\s+\w/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f).replaceAll("\\", "/"))
      .sort();
    // intentcastRepo: feed, shared link, reply check use audienceVisibleSql; the rest are author-only or jobs.
    // citiesRepo: city page posts use audienceVisibleSql. analyticsRepo: admin aggregates only.
    expect(readers).toEqual(["repos/analyticsRepo.ts", "repos/citiesRepo.ts", "repos/intentcastRepo.ts"]);
    for (const f of ["repos/citiesRepo.ts", "repos/intentcastRepo.ts"]) {
      expect(readFileSync(path.join(root, f), "utf8")).toContain("audienceVisibleSql(");
    }
  });
});
