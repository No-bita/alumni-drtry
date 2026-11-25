import { describe, expect, it, vi } from "vitest";
import { MATCH_CATEGORIES, parseMatchQuestion } from "../src/lib/matchIntent.js";
import { buildMatchReasons, intentNeedsDetail, primarySignalsForIntent, rankMatches, type MatchCandidateSignals } from "../src/lib/matchScore.js";
import { functionForRoleLabel } from "../src/lib/jobFunctions.js";
import { composeNoteMessage, noteCategory, NoteDetailsError, validateNoteDetails } from "../src/lib/noteDetails.js";
import { MatchRepo } from "../src/repos/matchRepo.js";
import { buildCandidateQuery } from "../src/services/matchService.js";
import type { PoolExecutor } from "../src/db/types.js";

/** Ask recognises hiring (2026-11-25). */
const none = { organizations: [], places: [] };
const parse = (q: string) => parseMatchQuestion(q, none);

describe("hiring intent", () => {
  it("is a kind of help", () => {
    expect(MATCH_CATEGORIES).toContain("hiring");
  });

  it.each([
    ["I'm hiring a product manager", "Product Manager"],
    ["Looking to hire backend engineers in Bengaluru", "Software Engineer"],
    ["We are hiring a PM for our team", "Product Manager"],
    ["Recruiting a data scientist", "Data Scientist"],
    ["Want someone to join my team as a designer", "Designer"],
    ["Need a data analyst for my startup", "Data Analyst"],
  ])("recognises %s", (q, role) => {
    const i = parse(q);
    expect(i.category).toBe("hiring");
    expect(i.role).toBe(role);
    expect(i.keywords).not.toContain("hiring");
  });

  it.each([
    "Who is hiring for PM roles?",
    "Is Razorpay hiring?",
    "anyone hiring product designers?",
    "How do I get hired at Google",
    "What is the hiring process at Meesho",
    "Which companies are hiring data analysts",
    "Talk to a recruiter at Google",
  ])("leaves job-seeker wording alone: %s", (q) => {
    expect(parse(q).category).not.toBe("hiring");
  });

  it("asks for the role first when none is named", () => {
    const i = parse("Hiring interns at Razorpay");
    expect(i.category).toBe("hiring");
    expect(i.role).toBeNull();
    expect(intentNeedsDetail(i)).toBe(true);
  });

  it("qualifies people in the role now or in its function; the company named never qualifies anyone", () => {
    expect(primarySignalsForIntent(parse("I'm hiring a product manager"))).toEqual(["currentRole", "function"]);
    const consultant = { ...parse("Hiring a consultant for my team"), role: "Consultant" };
    expect(primarySignalsForIntent(consultant)).toEqual(["currentRole"]);
    expect(functionForRoleLabel("Product Manager")).toBe("product");
    expect(functionForRoleLabel("Consultant")).toBeNull();
    const q = buildCandidateQuery({ ...parse("We are hiring a PM"), company: "Acme" }, none, { viewerPersonId: "v", viewerIsDemo: false });
    expect(q.companyPattern).toBeNull();
    expect(q.jobFunction).toBe("product");
    expect(q.requiredAnyOf).toEqual(["cr", "fn"]);
  });

  it("ranks people in the role above people only in the function, and says why", () => {
    const intent = parse("I'm hiring a product manager");
    const base = {
      fullName: "x", batchYear: 2018, departmentCode: null, departmentName: null, headlineRoleTitle: null, headlineOrganizationName: null,
      residenceCity: null, residenceCountry: null, currentAtCompany: null, pastAtCompany: null, currentRoleMatch: null, pastRoleMatch: null,
      pastFromRoleMatch: null, cityMatch: false, countryMatch: false, studyProgramMatch: null, studyTypeMatch: null, founderMatch: null,
      functionMatch: false, keywordHits: [], openTo: [], completenessScore: 0,
    } satisfies Omit<MatchCandidateSignals, "personId">;
    const pm = { ...base, personId: "pm", currentRoleMatch: { roleTitle: "Product Manager", organizationName: "Swiggy", isCurrent: true } };
    const fnOnly = { ...base, personId: "fn", functionMatch: true };
    const neither = { ...base, personId: "no" };
    expect(rankMatches(intent, [fnOnly, neither, pm]).map((m) => m.candidate.personId)).toEqual(["pm", "fn"]);
    expect(buildMatchReasons(intent, fnOnly)).toEqual([{ key: "same_function", text: "Works in Product" }]);
  });

  it("the candidate query matches people.job_function", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (text: string) => { calls.push(text); return { rows: [] }; });
    const db = { query, connect: async () => ({ query, release: () => {} }) } as unknown as PoolExecutor;
    await new MatchRepo(db).findCandidates(buildCandidateQuery(parse("I'm hiring a product manager"), none, { viewerPersonId: "v", viewerIsDemo: false }));
    const sql = calls.find((t) => t.includes("FROM people p"))!;
    expect(sql).toMatch(/\(p\.job_function = \$\d+\) AS function_match/);
    expect(sql).toMatch(/WHERE cr_role IS NOT NULL OR function_match/);
  });
});

describe("Hiring note (a hirer writing to a possible candidate)", () => {
  const note = { purpose: "hiring", role: "  Product   Manager ", company: "Acme", message: "x".repeat(90), jobUrl: "" };

  it("checks the fields and composes the readable note", () => {
    const d = validateNoteDetails(note);
    expect(d).toEqual({ purpose: "hiring", role: "Product Manager", company: "Acme", message: "x".repeat(90), jobUrl: null });
    expect(composeNoteMessage(d)).toBe(`Hiring: Product Manager at Acme\n\n${"x".repeat(90)}`);
    expect(composeNoteMessage({ ...d, jobUrl: "https://jobs.example.com/pm" } as typeof d)).toContain("\n\nJob: https://jobs.example.com/pm");
    expect(noteCategory(d)).toBe("hiring");
  });

  it("refuses a short message, a missing role or company, and a bad job link", () => {
    const code = (input: object) => {
      try {
        validateNoteDetails(input as never);
      } catch (e) {
        return (e as NoteDetailsError).code;
      }
      return null;
    };
    expect(code({ ...note, message: "too short" })).toBe("CONTACT_REQUEST_MESSAGE_LENGTH");
    expect(code({ ...note, role: "" })).toBe("CONTACT_REQUEST_ROLE_REQUIRED");
    expect(code({ ...note, company: " " })).toBe("CONTACT_REQUEST_COMPANY_REQUIRED");
    expect(code({ ...note, jobUrl: "not a link" })).toBe("CONTACT_REQUEST_JOB_LINK_INVALID");
  });
});
