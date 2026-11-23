import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DiscoveryService } from "../src/services/discoveryService.js";
import { DiscoveryRepo } from "../src/repos/discoveryRepo.js";
import { MatchRepo } from "../src/repos/matchRepo.js";

/** One-page profile: institute name, the viewer's reachout status, the "profile" source, no bio in Ask. */

function bundleRow(over: Record<string, unknown> = {}) {
  return {
    id: "p2",
    full_name: "Riya Sharma",
    department_code: "cse",
    department_name: "Computer Science",
    department_other_text: null,
    department_other_status: null,
    department_other_rejection_reason: null,
    parsed_department_code: null,
    parsed_department_name: null,
    batch_year: 2019,
    parsed_joining_year: 2015,
    degree_code: "btech",
    degree_name: "BTech",
    bio: null,
    residence_country: "India",
    residence_city: "Bengaluru",
    open_to_preferences: null,
    profile_completed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    email_domain: "iitb.ac.in",
    occupations_json: [],
    links_json: [],
    areas_json: ["Pricing"],
    ...over
  };
}

function fakeDb(row: Record<string, unknown> | null) {
  const calls: string[] = [];
  const query = vi.fn(async (text: string) => {
    calls.push(text);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  });
  return { db: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) }, calls };
}

describe("public profile: institute name", () => {
  it("comes from the email domain and never exposes the address", async () => {
    const { db, calls } = fakeDb(bundleRow());
    const bundle = await new DiscoveryRepo(db as never).findPublicProfileBundleById("p2", "viewer-1");
    expect(bundle?.profile.institutionName).toBe("IIT Bombay");
    expect(JSON.stringify(bundle)).not.toContain("@");
    expect(calls[0]).toContain("split_part(lower(p.institutional_email), '@', 2) AS email_domain");
  });

  it("is null for a domain outside the directory, and IIM Lucknow's alumni domain maps to the institute", async () => {
    const unknown = await new DiscoveryRepo(fakeDb(bundleRow({ email_domain: "example.com" })).db as never).findPublicProfileBundleById("p2", null);
    expect(unknown?.profile.institutionName).toBeNull();
    const iiml = await new DiscoveryRepo(fakeDb(bundleRow({ email_domain: "iiml.org" })).db as never).findPublicProfileBundleById("p2", null);
    expect(iiml?.profile.institutionName).toBe("IIM Lucknow");
  });
});

describe("public profile: the viewer's reachout", () => {
  function service(lookup: ((sender: string, ids: readonly string[]) => Promise<Map<string, "pending" | "accepted" | "declined">>) | null) {
    const svc = new DiscoveryService({} as Pool);
    const repo = { findPublicProfileBundleById: vi.fn(async () => ({ profile: { id: "p2" }, occupations: [], links: [], areas: [] })) };
    (svc as unknown as { discoveryRepo: typeof repo }).discoveryRepo = repo;
    const latest = lookup ? vi.fn(lookup) : null;
    if (latest) svc.setReachOut({ latestStatusFromSender: latest });
    return { svc, latest };
  }

  it("returns the latest status from this viewer", async () => {
    const { svc, latest } = service(async () => new Map([["p2", "pending" as const]]));
    expect((await svc.getPublicProfile("p2", "viewer-1")).yourNote).toBe("pending");
    expect(latest).toHaveBeenCalledWith("viewer-1", ["p2"]);
  });

  it("is null with no reachout, on your own profile, and when no lookup is wired", async () => {
    expect((await service(async () => new Map()).svc.getPublicProfile("p2", "viewer-1")).yourNote).toBeNull();
    const own = service(async () => new Map([["p2", "accepted" as const]]));
    expect((await own.svc.getPublicProfile("p2", "p2")).yourNote).toBeNull();
    expect(own.latest).not.toHaveBeenCalled();
    expect((await service(null).svc.getPublicProfile("p2", "viewer-1")).yourNote).toBeNull();
  });
});

describe("Ask no longer reads the bio", () => {
  it("neither searches nor scores it", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (text: string) => {
      calls.push(text);
      return { rows: [], rowCount: 0 };
    });
    await new MatchRepo({ query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never).findCandidates({
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
    } as never);
    const sql = calls.join("\n");
    expect(sql).not.toMatch(/p\.bio/);
    expect(sql).toContain("FROM person_areas pa WHERE pa.person_id = p.id");
  });
});

describe("migration 071", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/071_contact_request_profile_source.sql"), "utf8");
  it("adds 'profile' as a source with the same categories as Ask and Careers", () => {
    expect(sql).toContain("source IN ('match', 'whatsapp', 'careers', 'cities', 'profile')");
    expect(sql).toContain("source IN ('match', 'whatsapp', 'careers', 'profile')");
    expect(sql).toContain("'referral', 'interview_prep', 'career_switch', 'higher_studies', 'relocation', 'founder_advice'");
    expect(sql).toContain("source = 'cities'");
  });
});
