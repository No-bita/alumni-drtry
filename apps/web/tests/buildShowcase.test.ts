import { describe, expect, it } from "vitest";
import { buildBuildPostContent, parseBuildPostContent } from "../src/lib/buildPostContent";
import { filterBuildProjects, mapIntentcastToBuildProject, type BuildProject } from "../src/lib/buildShowcase";
import type { IntentcastFeedItem } from "../src/api/client";

function makeIntentcast(partial?: Partial<IntentcastFeedItem>): IntentcastFeedItem {
  return {
    id: partial?.id ?? "ic-1",
    authorPersonId: partial?.authorPersonId ?? "p-1",
    authorFullName: partial?.authorFullName ?? "Aaryan Shah",
    authorDepartmentCode: partial?.authorDepartmentCode ?? "cse",
    authorDepartmentName: partial?.authorDepartmentName ?? "Computer Science",
    authorBatchYear: partial?.authorBatchYear ?? 2022,
    authorCurrentRoleTitle: partial?.authorCurrentRoleTitle ?? "Founder",
    authorCurrentOrganizationName: partial?.authorCurrentOrganizationName ?? "Studio",
    category: "collaboration",
    content: partial?.content ?? "Title: Sample\nIndustry: SaaS\nDescription: Building something",
    status: partial?.status ?? "open",
    expiresAt: partial?.expiresAt ?? "2026-06-01T00:00:00.000Z",
    closedAt: partial?.closedAt ?? null,
    createdAt: partial?.createdAt ?? "2026-05-01T00:00:00.000Z",
    editableUntil: partial?.editableUntil ?? "2026-05-01T00:10:00.000Z",
    authorSoftDeletedAt: partial?.authorSoftDeletedAt ?? null,
    authorDeletePurgeAt: partial?.authorDeletePurgeAt ?? null,
    responseCount: partial?.responseCount ?? 0,
    viewerHasResponded: partial?.viewerHasResponded ?? false,
  };
}

describe("build post content schema", () => {
  it("round-trips structured fields", () => {
    const content = buildBuildPostContent({
      title: "Looking for GTM advisor",
      industry: "SaaS",
      description: "Workflow ops tooling",
      projectName: "Project Atlas",
      oneLinePitch: "Ops workflows in one command center",
      stage: "prototype",
      domain: "B2B SaaS",
      supportNeeded: ["mentorship", "clients"],
      location: "Bengaluru",
      links: ["https://atlas.demo"],
      askDetails: "Need pilot customers",
    });

    const parsed = parseBuildPostContent(content);
    expect(parsed.projectName).toBe("Project Atlas");
    expect(parsed.stage).toBe("prototype");
    expect(parsed.supportNeeded).toEqual(["mentorship", "clients"]);
    expect(parsed.links).toEqual(["https://atlas.demo"]);
    expect(parsed.askDetails).toBe("Need pilot customers");
  });
});

describe("build showcase mapping/filtering", () => {
  it("maps intentcast content into build project model", () => {
    const ic = makeIntentcast({
      content: buildBuildPostContent({
        title: "Title A",
        industry: "Healthtech",
        description: "Desc A",
        projectName: "CareLoop",
        stage: "launched",
        supportNeeded: ["funding"],
      }),
    });
    const mapped = mapIntentcastToBuildProject(ic);
    expect(mapped.title).toBe("CareLoop");
    expect(mapped.domain).toBe("Healthtech");
    expect(mapped.stage).toBe("launched");
    expect(mapped.supportNeeded).toEqual(["funding"]);
  });

  it("filters by stage/support/query and sorts newest first", () => {
    const projects: BuildProject[] = [
      {
        intentcastId: "a",
        authorPersonId: "p1",
        authorName: "A",
        authorDepartmentCode: null,
        authorCompany: null,
        authorRole: null,
        title: "Build Alpha",
        oneLinePitch: "AI tooling",
        description: "Alpha",
        domain: "AI",
        stage: "idea",
        supportNeeded: ["mentorship"],
        location: "",
        links: [],
        askDetails: "",
        createdAt: "2026-05-01T00:00:00.000Z",
        viewerHasResponded: false,
      },
      {
        intentcastId: "b",
        authorPersonId: "p2",
        authorName: "B",
        authorDepartmentCode: null,
        authorCompany: null,
        authorRole: null,
        title: "Build Beta",
        oneLinePitch: "Sales workflow",
        description: "Beta",
        domain: "SaaS",
        stage: "prototype",
        supportNeeded: ["clients"],
        location: "",
        links: [],
        askDetails: "",
        createdAt: "2026-05-03T00:00:00.000Z",
        viewerHasResponded: false,
      },
    ];

    const filtered = filterBuildProjects(projects, {
      stage: "prototype",
      support: "clients",
      query: "sales",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.intentcastId).toBe("b");
  });
});
