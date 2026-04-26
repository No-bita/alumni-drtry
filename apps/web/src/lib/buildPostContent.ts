export type BuildPostContentInput = {
  title: string;
  industry: string;
  description: string;
  projectName?: string;
  oneLinePitch?: string;
  domain?: string;
  stage?: "idea" | "prototype" | "launched" | "scaling";
  supportNeeded?: Array<"mentorship" | "clients" | "funding" | "cofounder" | "distribution">;
  location?: string;
  links?: string[];
  askDetails?: string;
};

export type ParsedBuildPostContent = {
  title: string;
  industry: string;
  description: string;
  projectName: string;
  oneLinePitch: string;
  domain: string;
  stage: "idea" | "prototype" | "launched" | "scaling" | "";
  supportNeeded: Array<"mentorship" | "clients" | "funding" | "cofounder" | "distribution">;
  location: string;
  links: string[];
  askDetails: string;
};

const TITLE_PREFIX = "Title:";
const INDUSTRY_PREFIX = "Industry:";
const DESC_PREFIX = "Description:";
const METRICS_PREFIX = "Metrics:";
const SOCIAL_PREFIX = "Context:";
const PROJECT_PREFIX = "Project:";
const PITCH_PREFIX = "Pitch:";
const DOMAIN_PREFIX = "Domain:";
const STAGE_PREFIX = "Stage:";
const SUPPORT_PREFIX = "Support:";
const LOCATION_PREFIX = "Location:";
const LINKS_PREFIX = "Links:";
const ASK_PREFIX = "Ask:";

type SupportSignal = "mentorship" | "clients" | "funding" | "cofounder" | "distribution";
const SUPPORT_SIGNALS: ReadonlySet<SupportSignal> = new Set([
  "mentorship",
  "clients",
  "funding",
  "cofounder",
  "distribution",
]);
const STAGES: ReadonlySet<NonNullable<BuildPostContentInput["stage"]>> = new Set([
  "idea",
  "prototype",
  "launched",
  "scaling",
]);

export function buildBuildPostContent(input: BuildPostContentInput): string {
  const lines: string[] = [];
  lines.push(`${TITLE_PREFIX} ${input.title.trim()}`);
  lines.push(`${INDUSTRY_PREFIX} ${input.industry.trim()}`);
  lines.push(`${DESC_PREFIX} ${input.description.trim()}`);
  if (input.projectName?.trim()) lines.push(`${PROJECT_PREFIX} ${input.projectName.trim()}`);
  if (input.oneLinePitch?.trim()) lines.push(`${PITCH_PREFIX} ${input.oneLinePitch.trim()}`);
  if (input.domain?.trim()) lines.push(`${DOMAIN_PREFIX} ${input.domain.trim()}`);
  if (input.stage) lines.push(`${STAGE_PREFIX} ${input.stage}`);
  if (input.supportNeeded && input.supportNeeded.length > 0) {
    lines.push(`${SUPPORT_PREFIX} ${input.supportNeeded.join(", ")}`);
  }
  if (input.location?.trim()) lines.push(`${LOCATION_PREFIX} ${input.location.trim()}`);
  if (input.links && input.links.length > 0) {
    const cleanLinks = input.links.map((link) => link.trim()).filter(Boolean);
    if (cleanLinks.length > 0) lines.push(`${LINKS_PREFIX} ${cleanLinks.join(", ")}`);
  }
  if (input.askDetails?.trim()) lines.push(`${ASK_PREFIX} ${input.askDetails.trim()}`);
  return lines.join("\n");
}

export function parseBuildPostContent(content: string): ParsedBuildPostContent {
  const raw = content.trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let title = "";
  let industry = "";
  let description = "";
  let projectName = "";
  let oneLinePitch = "";
  let domain = "";
  let stage: ParsedBuildPostContent["stage"] = "";
  let supportNeeded: ParsedBuildPostContent["supportNeeded"] = [];
  let location = "";
  let links: string[] = [];
  let askDetails = "";

  for (const line of lines) {
    if (line.toLowerCase().startsWith(TITLE_PREFIX.toLowerCase())) {
      title = line.slice(TITLE_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(DESC_PREFIX.toLowerCase())) {
      description = line.slice(DESC_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(INDUSTRY_PREFIX.toLowerCase())) {
      industry = line.slice(INDUSTRY_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(PROJECT_PREFIX.toLowerCase())) {
      projectName = line.slice(PROJECT_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(PITCH_PREFIX.toLowerCase())) {
      oneLinePitch = line.slice(PITCH_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(DOMAIN_PREFIX.toLowerCase())) {
      domain = line.slice(DOMAIN_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(STAGE_PREFIX.toLowerCase())) {
      const s = line.slice(STAGE_PREFIX.length).trim().toLowerCase();
      if (STAGES.has(s as NonNullable<BuildPostContentInput["stage"]>)) {
        stage = s as ParsedBuildPostContent["stage"];
      }
      continue;
    }
    if (line.toLowerCase().startsWith(SUPPORT_PREFIX.toLowerCase())) {
      const rawSupport = line.slice(SUPPORT_PREFIX.length).split(",");
      supportNeeded = rawSupport
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry): entry is SupportSignal => SUPPORT_SIGNALS.has(entry as SupportSignal));
      continue;
    }
    if (line.toLowerCase().startsWith(LOCATION_PREFIX.toLowerCase())) {
      location = line.slice(LOCATION_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(LINKS_PREFIX.toLowerCase())) {
      links = line
        .slice(LINKS_PREFIX.length)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }
    if (line.toLowerCase().startsWith(ASK_PREFIX.toLowerCase())) {
      askDetails = line.slice(ASK_PREFIX.length).trim();
      continue;
    }
    if (line.toLowerCase().startsWith(METRICS_PREFIX.toLowerCase())) {
      continue;
    }
    if (line.toLowerCase().startsWith(SOCIAL_PREFIX.toLowerCase())) {
      continue;
    }
  }

  // Back-compat / graceful fallback: old free-form posts still show up.
  if (!title && lines.length > 0) title = lines[0] ?? "";
  if (!description) {
    const rest = lines.slice(1).join("\n").trim();
    description = rest || raw;
  }

  return {
    title,
    industry,
    description,
    projectName,
    oneLinePitch,
    domain,
    stage,
    supportNeeded,
    location,
    links,
    askDetails,
  };
}

