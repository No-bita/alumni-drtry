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

/** YoE chip body: `3 years` by default; `3+ years` only when copy uses `+` before years/yrs. */
function pickExperience(text: string): string | null {
  const explicitPlus =
    text.match(/(\d+)\s*\+\s*(?:years?|yrs?)\b/i) ?? text.match(/\b(\d+)\+(?:years?|yrs?)\b/i);
  if (explicitPlus?.[1]) return `${explicitPlus[1]}+ years`;

  const plain = text.match(/\b(\d+)\s*(?:years?|yrs?)\b(?:\s+(?:of\s+)?experience)?/i);
  if (plain?.[1]) return `${plain[1]} years`;

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
  /^(.+?)\s*[—–-]\s*(.+?)\s*\(([^)]*)\)\.\s*(.*)$/s;

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

/** Best-effort scan of free-form copy for employment / experience / comp hints when the structured opener did not match. */
export function extractCareerAttributeHints(text: string): {
  employmentLabel: string | null;
  experienceLabel: string | null;
  salaryLabel: string | null;
} {
  const t = text.trim();
  if (!t) {
    return { employmentLabel: null, experienceLabel: null, salaryLabel: null };
  }
  return {
    employmentLabel: pickEmployment(t),
    experienceLabel: pickExperience(t),
    salaryLabel: pickSalary(t),
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

/** Referral / mentorship posts may include `Role link: https://…` on its own line (structured composer). */
const ROLE_LINK_LINE_RE = /(?:^|[\r\n])\s*Role\s+link\s*:?\s*(https?:\/\/[^\s<>"')]+)/i;

/** Referral asks: `Resume link:`, `Resume:`, `CV link:`, or `CV:` before an http(s) URL on a line. */
const RESUME_LINK_LINE_RE =
  /(?:^|[\r\n])\s*(?:Resume\s+link|Resume|CV\s+link|CV)\s*:?\s*(https?:\/\/[^\s<>"')]+)/i;

function stripValidatedStructuredHttpUrl(urlRaw: string): string | null {
  const url = urlRaw.replace(/[.,;]+$/, "");
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return url;
}

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

  intro = stripStructuredHiringTailMeta(intro);
  intro = stripHiringTailChipDuplicateProse(intro);

  let roleSummary = takeFirstSentences(intro, 2);
  if (!roleSummary && intro) {
    roleSummary = intro;
  }
  if (!roleSummary && !applySteps && !jdUrl) {
    let fb = stripStructuredHiringTailMeta(raw);
    fb = stripHiringTailChipDuplicateProse(fb);
    roleSummary = takeFirstSentences(fb, 2) || fb;
  }

  return { roleSummary, jdUrl, applySteps };
}

export type StructuredCareerRoleLinkResult = {
  listingUrl: string | null;
  resumeUrl: string | null;
  proseAfterLink: string;
  /** Set when {@link listingUrl} came from leading http(s) text, not from an explicit `Role link:` line. */
  listingFromBareLeadingUrl?: boolean;
};

/**
 * Mentorship/referral-only: if the only URL was a bare leading link (no `Role link:`) and there is no prose,
 * treat it as a resume/CV link rather than a job posting link.
 */
export function promoteBareLeadingListingToResumeForReferral(
  extracted: StructuredCareerRoleLinkResult
): StructuredCareerRoleLinkResult {
  if (
    extracted.resumeUrl ||
    !extracted.listingUrl ||
    !extracted.listingFromBareLeadingUrl ||
    extracted.proseAfterLink.trim().length > 0
  ) {
    return extracted;
  }
  return {
    listingUrl: null,
    resumeUrl: extracted.listingUrl,
    proseAfterLink: "",
  };
}

/**
 * Pulls structured URLs from referral-style tails: `Role link:` (JD / posting), `Resume link:`,
 * else a leading http(s) URL is treated as the listing URL only.
 */
export function extractStructuredCareerRoleLink(description: string): StructuredCareerRoleLinkResult {
  const raw = description.trim();
  if (!raw) return { listingUrl: null, resumeUrl: null, proseAfterLink: "" };

  let working = raw;
  let listingUrl: string | null = null;
  let resumeUrl: string | null = null;

  let progressed = true;
  while (progressed) {
    progressed = false;
    const roleLineMatch = working.match(ROLE_LINK_LINE_RE);
    if (roleLineMatch?.[1] && !listingUrl) {
      const ok = stripValidatedStructuredHttpUrl(roleLineMatch[1]);
      if (ok) {
        listingUrl = ok;
        working = working.replace(roleLineMatch[0], "\n").replace(/\r?\n\s*\r?\n/g, "\n").trim();
        progressed = true;
        continue;
      }
    }
    const resumeLineMatch = working.match(RESUME_LINK_LINE_RE);
    if (resumeLineMatch?.[1] && !resumeUrl) {
      const ok = stripValidatedStructuredHttpUrl(resumeLineMatch[1]);
      if (ok) {
        resumeUrl = ok;
        working = working.replace(resumeLineMatch[0], "\n").replace(/\r?\n\s*\r?\n/g, "\n").trim();
        progressed = true;
        continue;
      }
    }
    break;
  }

  if (!listingUrl) {
    const urlMatch = working.match(DETAIL_URL_RE);
    if (urlMatch?.index === 0) {
      const urlCandidate = urlMatch[0].replace(/[.,;]+$/, "");
      try {
        const u = new URL(urlCandidate);
        if (u.protocol === "http:" || u.protocol === "https:") {
          return {
            listingUrl: urlCandidate,
            resumeUrl,
            proseAfterLink: working.slice(urlMatch[0].length).trim(),
            listingFromBareLeadingUrl: true,
          };
        }
      } catch {
        /* fall through */
      }
    }
  }

  return { listingUrl, resumeUrl, proseAfterLink: working };
}

/**
 * Hiring composer concatenates employment, summary, YoE, and compensation into the bulletin tail;
 * feeds show those as chips, so drop the redundant sentences from prose.
 */
export function stripHiringTailChipDuplicateProse(text: string): string {
  let w = text.trim();
  if (!w) return "";

  w = w.replace(/^Compensation\s*:\s*(?:₹|inr|rs\.?)?\s*[\d\-,\s]+\s*LPA\.?\s+/i, "").trim();

  w = w.replace(/^(?:Full[- ]time|Part[- ]time|Internship|Contract(?:\s+role)?)\s*[.;:]\s+/i, "").trim();

  w = w.replace(/\s+Compensation\s*:\s*(?:₹|inr|rs\.?)?\s*[\d\-,\s]+\s*LPA\.?\s*/gi, " ").trim();

  w = w.replace(/\s*\d+\+?\s*years?\s+(?:of\s+)?experience\.?\s*/gi, " ").trim();

  return w.replace(/\s+/g, " ").trim();
}

/** Strips structured blocks already surfaced as chips / links so feed summaries stay readable. */
export function stripStructuredHiringTailMeta(text: string): string {
  let working = text.trim();
  if (!working) return "";

  working = working.replace(ROLE_LINK_LINE_RE, "\n").replace(/\r?\n\s*\r?\n/g, "\n").trim();
  working = working.replace(RESUME_LINK_LINE_RE, "\n").replace(/\r?\n\s*\r?\n/g, "\n").trim();

  const applyMatch = working.match(/(?:Steps to apply|How to apply)\s*:\s*([\s\S]+)$/i);
  if (applyMatch?.index !== undefined) {
    working = working.slice(0, applyMatch.index).trim();
  }

  const urlMatch = working.match(DETAIL_URL_RE);
  if (urlMatch?.index === 0) {
    working = working.slice(urlMatch[0].length).trim();
  }

  return working.trim();
}

const EXP_CHIP_PREFIX_RE = /^exp\s*:\s*/i;
const COMP_CHIP_PREFIX_RE = /^comp\s*:\s*/i;

/** Drop trailing "exp" / "experience" — chip already uses an `Exp:` prefix. */
function stripRedundantExperienceTail(raw: string): string {
  return raw.replace(/\s+(?:exp|experience)\.?$/i, "").trim();
}

/** Rupee / INR tokens — omitted from compact `comp:` chips (preview + feeds). */
function stripRupeeAndInrPrefix(raw: string): string {
  return raw
    .trim()
    .replace(/^₹\s*/u, "")
    .replace(/^(?:inr|rs\.?)\s+/i, "")
    .trim();
}

/** Compact `20 LPA` → `20LPA` for the careers chip line (other salary shapes unchanged). */
function normalizeCompChipValue(raw: string): string {
  const t = stripRupeeAndInrPrefix(raw);
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*lpa$/i);
  if (m) {
    const n = m[1]!.replace(/,/g, "");
    return `${n}LPA`;
  }
  return t;
}

export function hiringExperienceChipFromParsed(experienceLabel: string | null): string | null {
  const e = experienceLabel?.trim();
  if (!e) return null;
  const body = EXP_CHIP_PREFIX_RE.test(e) ? e.replace(EXP_CHIP_PREFIX_RE, "").trim() : e;
  const cleaned = stripRedundantExperienceTail(body).replace(/\byrs\b/gi, "years");
  if (!cleaned) return null;
  return `Exp: ${cleaned}`;
}

export function hiringCompensationChipFromParsed(salaryLabel: string | null): string | null {
  const s = salaryLabel?.trim();
  if (!s) return null;
  const body = s.replace(COMP_CHIP_PREFIX_RE, "").trim();
  if (!body) return null;
  return `comp: ${normalizeCompChipValue(body)}`;
}
