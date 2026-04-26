import type { IntentcastFeedItem } from "../api/client";
import { parseBuildPostContent } from "./buildPostContent";

export type BuildStage = "idea" | "prototype" | "launched" | "scaling";
export type BuildSupportNeed = "mentorship" | "clients" | "funding" | "cofounder" | "distribution";

export type BuildProject = {
  intentcastId: string;
  authorPersonId: string;
  authorName: string;
  authorDepartmentCode: string | null;
  authorCompany: string | null;
  authorRole: string | null;
  title: string;
  oneLinePitch: string;
  description: string;
  domain: string;
  stage: BuildStage | "";
  supportNeeded: BuildSupportNeed[];
  location: string;
  links: string[];
  askDetails: string;
  createdAt: string;
  viewerHasResponded: boolean;
};

export type BuildFiltersState = {
  stage: "all" | BuildStage;
  support: "all" | BuildSupportNeed;
  query: string;
};

export const DEFAULT_BUILD_FILTERS: BuildFiltersState = {
  stage: "all",
  support: "all",
  query: "",
};

export function mapIntentcastToBuildProject(ic: IntentcastFeedItem): BuildProject {
  const parsed = parseBuildPostContent(ic.content);
  const fallbackDomain = parsed.industry || "General";
  const title = parsed.projectName || parsed.title || "Build update";
  const oneLinePitch = parsed.oneLinePitch || parsed.description.split(/\r?\n/)[0] || "";
  return {
    intentcastId: ic.id,
    authorPersonId: ic.authorPersonId,
    authorName: ic.authorFullName || "Alumni",
    authorDepartmentCode: ic.authorDepartmentCode,
    authorCompany: ic.authorCurrentOrganizationName ?? null,
    authorRole: ic.authorCurrentRoleTitle ?? null,
    title,
    oneLinePitch,
    description: parsed.description || ic.content.trim(),
    domain: parsed.domain || fallbackDomain,
    stage: parsed.stage,
    supportNeeded: parsed.supportNeeded,
    location: parsed.location,
    links: parsed.links,
    askDetails: parsed.askDetails,
    createdAt: ic.createdAt,
    viewerHasResponded: ic.viewerHasResponded,
  };
}

export function filterBuildProjects(projects: BuildProject[], filters: BuildFiltersState): BuildProject[] {
  const q = filters.query.trim().toLowerCase();
  return projects
    .filter((project) => (filters.stage === "all" ? true : project.stage === filters.stage))
    .filter((project) =>
      filters.support === "all" ? true : project.supportNeeded.includes(filters.support)
    )
    .filter((project) => {
      if (!q) return true;
      return (
        project.title.toLowerCase().includes(q) ||
        project.oneLinePitch.toLowerCase().includes(q) ||
        project.description.toLowerCase().includes(q) ||
        project.domain.toLowerCase().includes(q) ||
        project.supportNeeded.some((item) => item.includes(q))
      );
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
