export type BuildPostContentInput = {
  title: string;
  industry: string;
  description: string;
};

export type ParsedBuildPostContent = {
  title: string;
  industry: string;
  description: string;
};

const TITLE_PREFIX = "Title:";
const INDUSTRY_PREFIX = "Industry:";
const DESC_PREFIX = "Description:";
const METRICS_PREFIX = "Metrics:";
const SOCIAL_PREFIX = "Context:";

export function buildBuildPostContent(input: BuildPostContentInput): string {
  const lines: string[] = [];
  lines.push(`${TITLE_PREFIX} ${input.title.trim()}`);
  lines.push(`${INDUSTRY_PREFIX} ${input.industry.trim()}`);
  lines.push(`${DESC_PREFIX} ${input.description.trim()}`);
  return lines.join("\n");
}

export function parseBuildPostContent(content: string): ParsedBuildPostContent {
  const raw = content.trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let title = "";
  let industry = "";
  let description = "";

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
  };
}

