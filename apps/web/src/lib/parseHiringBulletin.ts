/**
 * Best-effort parse for hiring bulletin copy shaped like:
 * "ACME — Job title (City, remote hint). Full-time; 5+ years …"
 * Used for Career / Opportunities card layout; returns null if the pattern doesn’t match.
 */
export type ParsedHiringBulletin = {
  company: string;
  title: string;
  /** e.g. "San Francisco · Remote friendly" */
  locationLine: string;
  /** Text after the structured opener (role details, CTA, etc.) */
  description: string;
  employmentLabel: string | null;
  experienceLabel: string | null;
  salaryLabel: string | null;
};

function formatLocationSegments(raw: string): string {
  return raw
    .split(",")
    .map((s) =>
      s
        .trim()
        .replace(/\bremote[- ]friendly\b/gi, "Remote friendly")
        .replace(/\bremote\b/gi, "Remote")
    )
    .filter(Boolean)
    .join(" · ");
}

function pickEmployment(text: string): string | null {
  const m = text.match(/\b(full[- ]time|part[- ]time|contract(?:\s+role)?|internship)\b/i);
  if (!m?.[1]) return null;
  const w = m[1].toLowerCase().replace("-", " ");
  if (w === "full time") return "Full time";
  if (w === "part time") return "Part time";
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

function pickExperience(text: string): string | null {
  const m = text.match(/(\d+)\s*\+\s*(?:years?|yrs?)\b/i) ?? text.match(/\b(\d+)\+\s*years?\b/i);
  if (m?.[1]) return `${m[1]}+ years exp`;
  return null;
}

function pickSalary(text: string): string | null {
  if (/\bcompetitive\b/i.test(text)) return "₹ Competitive";
  if (/\b(?:₹|inr|rs\.?|lpa|lakh|crore)\b/i.test(text)) {
    const slice = text.match(/₹\s*[^.;]{1,32}|\b(?:inr|rs\.?)\b\s*[^.;]{1,32}|(?:\d[\d,]*\s*(?:lpa|lakh))/i);
    return slice?.[0]?.trim() ?? "₹ Competitive";
  }
  if (/\$\s*[\d,]+|\d+k\+/i.test(text)) {
    const slice = text.match(/\$\s*[\d,]+|\d+k\+/i);
    return slice?.[0]?.trim() ?? null;
  }
  return null;
}

const STRUCTURED_LEAD =
  /^(.+?)\s*[—–\-]\s*(.+?)\s*\(([^)]*)\)\.\s*(.*)$/s;

/** Fields collected in the hiring compose form; serializes to the opportunity-card shape. */
export type HiringBulletinComposeFields = {
  company: string;
  title: string;
  /** Shown inside parentheses, e.g. "Bengaluru, Remote friendly". */
  location: string;
  /** Everything after the closing paren (employment type, comp, description, CTA). */
  details: string;
};

/**
 * Builds bulletin `content` that {@link parseHiringBulletin} can render as a career opportunity card.
 * Uses an em dash between company and title, matching the feed examples.
 */
export function buildHiringBulletinContent(fields: HiringBulletinComposeFields): string {
  const company = fields.company.trim();
  const title = fields.title.trim();
  const location = fields.location.trim();
  const details = fields.details.trim();
  const head = `${company} — ${title} (${location}).`;
  if (!details) return head;
  return `${head} ${details}`;
}

/** User-facing validation before post; returns an error message or null if OK. */
export function validateHiringBulletinFields(fields: HiringBulletinComposeFields): string | null {
  if (!fields.company.trim()) return "Add the company or team name.";
  if (!fields.title.trim()) return "Add the role title.";
  if (!fields.location.trim()) return "Add the location (city, remote policy, etc.).";
  return null;
}

export function parseHiringBulletin(content: string): ParsedHiringBulletin | null {
  const trimmed = content.trim();
  const m = trimmed.match(STRUCTURED_LEAD);
  if (!m) return null;

  const company = m[1]!.trim();
  const title = m[2]!.trim();
  const locationRaw = m[3]!.trim();
  const tail = m[4]!.trim();

  if (!company || !title) return null;

  const locationLine = formatLocationSegments(locationRaw);
  const employmentLabel = pickEmployment(tail);
  const experienceLabel = pickExperience(tail);
  const salaryLabel = pickSalary(tail);

  return {
    company,
    title,
    locationLine,
    description: tail,
    employmentLabel,
    experienceLabel,
    salaryLabel,
  };
}

/** "Priya Mehta" → "Priya M." */
export function postedByShortLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Alum";
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initial = last[0]?.toUpperCase() ?? "";
  return initial ? `${first} ${initial}.` : first;
}

/** First `https?://…` in the details tail (for JD link). */
const DETAIL_URL_RE = /https?:\/\/[^\s<>"')]+/i;

function takeFirstSentences(text: string, maxSentences: number): string {
  const t = text.trim();
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= maxSentences) return t;
  return parts.slice(0, maxSentences).join(" ").trim();
}

export type HiringCardBodySections = {
  /** 1–2 sentences about the role (from details, before JD / apply blocks). */
  roleSummary: string;
  /** First http(s) URL in details, if any. */
  jdUrl: string | null;
  /** Text after an optional “Steps to apply:” / “How to apply:” block. */
  applySteps: string;
};

/**
 * Splits the hiring `details` tail for the Opportunities card: short role blurb, JD link, apply steps.
 * Recognizes a leading URL and a trailing `Steps to apply:` or `How to apply:` section.
 */
export function splitHiringDetailsForCard(tail: string): HiringCardBodySections {
  const raw = tail.trim();
  if (!raw) {
    return { roleSummary: "", jdUrl: null, applySteps: "" };
  }

  const urlMatch = raw.match(DETAIL_URL_RE);
  let jdUrl: string | null = null;
  let working = raw;
  if (urlMatch?.[0]) {
    jdUrl = urlMatch[0].replace(/[.,;]+$/, "");
    try {
      const u = new URL(jdUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        jdUrl = null;
        working = raw;
      } else {
        working = raw.replace(urlMatch[0], " ").replace(/\s+/g, " ").trim();
      }
    } catch {
      jdUrl = null;
      working = raw;
    }
  }

  const applyRe = /(?:Steps to apply|How to apply)\s*:\s*([\s\S]+)$/i;
  const applyMatch = working.match(applyRe);
  let applySteps = "";
  let intro = working;
  if (applyMatch?.[1]) {
    applySteps = applyMatch[1].trim();
    const cut = applyMatch.index ?? 0;
    intro = working.slice(0, cut).trim();
  }

  let roleSummary = takeFirstSentences(intro, 2);
  if (!roleSummary && intro) {
    roleSummary = intro;
  }
  if (!roleSummary && !applySteps && !jdUrl) {
    roleSummary = takeFirstSentences(raw, 2) || raw;
  }

  return { roleSummary, jdUrl, applySteps };
}
