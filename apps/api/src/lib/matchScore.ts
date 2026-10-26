/**
 * Ask → Match: score candidates and build a factual "why them".
 *
 * Every reason is built from a signal the database actually returned for that alum.
 * Nothing here invents text: no signal → no reason → (for primary signals) no match.
 */
import type { MatchCategory, MatchIntent } from "./matchIntent.js";
import type { OpenToOptionId } from "./openToPreferences.js";

export interface OccupationSignal {
  roleTitle: string;
  organizationName: string | null;
  isCurrent: boolean;
}

/** One candidate row with match signals, as returned by `MatchRepo`. */
export interface MatchCandidateSignals {
  personId: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
  residenceCity: string | null;
  residenceCountry: string | null;
  /** Current occupation at the asked company. */
  currentAtCompany: OccupationSignal | null;
  /** Past occupation at the asked company (only when not currently there). */
  pastAtCompany: OccupationSignal | null;
  /** Current occupation whose title matches the target role. */
  currentRoleMatch: OccupationSignal | null;
  /** Past occupation whose title matches the target role. */
  pastRoleMatch: OccupationSignal | null;
  /** Past occupation whose title matches the career-switch source role. */
  pastFromRoleMatch: OccupationSignal | null;
  cityMatch: boolean;
  countryMatch: boolean;
  /** Higher-education occupation whose title names an asked study program. */
  studyProgramMatch: OccupationSignal | null;
  /** Any higher-education / research occupation (weaker than a program match). */
  studyTypeMatch: OccupationSignal | null;
  /** Founded-a-venture occupation or a founder title. */
  founderMatch: OccupationSignal | null;
  /** Keywords from the question found in role, description, bio or org name. */
  keywordHits: string[];
  openTo: OpenToOptionId[];
  completenessScore: number;
}

export type MatchReasonKey =
  | "current_company"
  | "past_company"
  | "current_role"
  | "past_role"
  | "made_switch"
  | "lives_in_city"
  | "lives_in_country"
  | "study_program"
  | "higher_education"
  | "founder"
  | "keyword"
  | "open_to";

export interface MatchReason {
  key: MatchReasonKey;
  text: string;
}

export interface ScoredMatch {
  candidate: MatchCandidateSignals;
  score: number;
  reasons: MatchReason[];
  /** First three reasons joined with " · ". */
  whyThem: string;
  /** Open-to tags relevant to the asked category (subset of candidate.openTo). */
  relevantOpenTo: OpenToOptionId[];
}

export const MATCH_RESULT_LIMIT = 5;

/** "Will help" tags per category. */
export const CATEGORY_OPEN_TO: Record<MatchCategory, OpenToOptionId[]> = {
  referral: ["referrals", "hiring"],
  interview_prep: ["mentorship", "coffee"],
  career_switch: ["mentorship", "coffee"],
  higher_studies: ["study_advice", "mentorship", "advising"],
  relocation: ["city_help", "coffee", "intros"],
  founder_advice: ["collaboration", "advising"]
};

const OPEN_TO_TITLES: Record<OpenToOptionId, string> = {
  referrals: "referrals",
  coffee: "coffee chats",
  mentorship: "mentorship",
  hiring: "hiring help",
  advising: "advising",
  speaking: "speaking",
  intros: "introductions",
  collaboration: "collaboration",
  city_help: "helping newcomers settle in",
  study_advice: "higher-studies advice"
};

/**
 * "Can help" signals dominate; "will help" (open-to) and keywords only reorder within a tier.
 * E.g. a past PM at the asked company (35 + 15) outranks a PM elsewhere who is open to
 * mentoring and mentions a keyword (30 + 10 + 8).
 */
export const MATCH_WEIGHTS = {
  currentAtCompany: 50,
  pastAtCompany: 35,
  currentRole: 30,
  pastRole: 15,
  madeSwitch: 25,
  city: 40,
  country: 20,
  studyProgram: 35,
  studyType: 20,
  founder: 40,
  keywordEach: 4,
  keywordMax: 8,
  openTo: 10
} as const;

export type SignalName =
  | "company"
  | "currentCompany"
  | "role"
  | "currentRole"
  | "place"
  | "study"
  | "founder"
  | "keyword";

function has(c: MatchCandidateSignals, s: SignalName): boolean {
  switch (s) {
    case "company":
      return Boolean(c.currentAtCompany || c.pastAtCompany);
    case "currentCompany":
      return Boolean(c.currentAtCompany);
    case "role":
      return Boolean(c.currentRoleMatch || c.pastRoleMatch);
    case "currentRole":
      return Boolean(c.currentRoleMatch);
    case "place":
      return c.cityMatch || c.countryMatch;
    case "study":
      return Boolean(c.studyProgramMatch || c.studyTypeMatch);
    case "founder":
      return Boolean(c.founderMatch);
    case "keyword":
      return c.keywordHits.length > 0;
  }
}

/**
 * Which "can help" signals qualify a candidate for this intent. A candidate must have
 * at least one. Open-to tags never qualify on their own.
 */
export function primarySignalsForIntent(intent: MatchIntent): SignalName[] {
  const anyEntity = (): SignalName[] => {
    const out: SignalName[] = [];
    if (intent.company) out.push("company");
    if (intent.role) out.push("role");
    if (intent.city || intent.country) out.push("place");
    if (intent.studyPrograms.length > 0) out.push("study");
    return out;
  };

  switch (intent.category) {
    case "referral":
      if (intent.company) return ["currentCompany"];
      if (intent.role) return ["currentRole"];
      return anyEntity();
    case "interview_prep":
      if (intent.company && intent.role) return ["company", "role"];
      if (intent.company) return ["company"];
      if (intent.role) return ["role"];
      if (intent.studyPrograms.length > 0) return ["study"];
      return anyEntity();
    case "career_switch":
      if (intent.role) return ["currentRole"];
      return anyEntity();
    case "higher_studies":
      return ["study"];
    case "relocation":
      if (intent.city || intent.country) return ["place"];
      return [];
    case "founder_advice":
      return ["founder"];
    default:
      // No clear kind of help: qualify on the most specific thing named (company > role > place > study).
      // Other matches still boost ranking. Keywords alone are too noisy to qualify anyone.
      if (intent.company) return ["company"];
      if (intent.role) return ["role"];
      if (intent.city || intent.country) return ["place"];
      if (intent.studyPrograms.length > 0) return ["study"];
      return [];
  }
}

function occupationPhrase(o: OccupationSignal): string {
  const org = o.organizationName?.trim();
  return org ? `${o.roleTitle.trim()} at ${org}` : o.roleTitle.trim();
}

function tensePhrase(o: OccupationSignal): string {
  return `${o.isCurrent ? "Currently" : "Previously"} ${occupationPhrase(o)}`;
}

function placeLabel(city: string | null, country: string | null): string | null {
  const c = city?.trim();
  const k = country?.trim();
  if (c && k) return `${c}, ${k}`;
  return c || k || null;
}

export function buildMatchReasons(intent: MatchIntent, c: MatchCandidateSignals): MatchReason[] {
  const reasons: MatchReason[] = [];
  const seenOccupations = new Set<string>();
  const pushOccupation = (key: MatchReasonKey, o: OccupationSignal, text: string) => {
    const id = `${o.roleTitle}|${o.organizationName ?? ""}|${o.isCurrent}`;
    if (seenOccupations.has(id)) return;
    seenOccupations.add(id);
    reasons.push({ key, text });
  };

  if (c.currentAtCompany) pushOccupation("current_company", c.currentAtCompany, tensePhrase(c.currentAtCompany));
  if (c.pastAtCompany) pushOccupation("past_company", c.pastAtCompany, tensePhrase(c.pastAtCompany));

  if (intent.category === "career_switch" && c.currentRoleMatch && c.pastFromRoleMatch) {
    const from = c.pastFromRoleMatch.roleTitle.trim();
    const to = occupationPhrase(c.currentRoleMatch);
    seenOccupations.add(`${c.currentRoleMatch.roleTitle}|${c.currentRoleMatch.organizationName ?? ""}|${c.currentRoleMatch.isCurrent}`);
    reasons.push({ key: "made_switch", text: `Moved from ${from} to ${to}` });
  } else {
    if (c.currentRoleMatch) pushOccupation("current_role", c.currentRoleMatch, tensePhrase(c.currentRoleMatch));
    if (c.pastRoleMatch) pushOccupation("past_role", c.pastRoleMatch, tensePhrase(c.pastRoleMatch));
  }

  if (c.studyProgramMatch) pushOccupation("study_program", c.studyProgramMatch, tensePhrase(c.studyProgramMatch));
  else if (c.studyTypeMatch) pushOccupation("higher_education", c.studyTypeMatch, tensePhrase(c.studyTypeMatch));

  if (c.founderMatch) pushOccupation("founder", c.founderMatch, tensePhrase(c.founderMatch));

  if (c.cityMatch) {
    const label = placeLabel(c.residenceCity, c.residenceCountry);
    if (label) reasons.push({ key: "lives_in_city", text: `Lives in ${label}` });
  } else if (c.countryMatch) {
    const label = c.residenceCountry?.trim() || placeLabel(c.residenceCity, null);
    if (label) reasons.push({ key: "lives_in_country", text: `Lives in ${label}` });
  }

  const relevant = relevantOpenTo(intent, c);
  if (relevant.length > 0) {
    reasons.push({ key: "open_to", text: `Open to ${relevant.map((id) => OPEN_TO_TITLES[id]).join(" & ")}` });
  }

  if (c.keywordHits.length > 0) {
    const shown = c.keywordHits.slice(0, 2).map((k) => `“${k}”`).join(", ");
    reasons.push({ key: "keyword", text: `Profile mentions ${shown}` });
  }

  return reasons;
}

export function relevantOpenTo(intent: MatchIntent, c: MatchCandidateSignals): OpenToOptionId[] {
  if (!intent.category) return [];
  const wanted = CATEGORY_OPEN_TO[intent.category];
  // Category order: the most specific tag (e.g. city_help for relocation) reads first.
  return wanted.filter((id) => c.openTo.includes(id));
}

export function scoreCandidate(intent: MatchIntent, c: MatchCandidateSignals): number {
  const w = MATCH_WEIGHTS;
  let score = 0;
  if (c.currentAtCompany) score += w.currentAtCompany;
  else if (c.pastAtCompany) score += w.pastAtCompany;
  if (c.currentRoleMatch) score += w.currentRole;
  else if (c.pastRoleMatch) score += w.pastRole;
  if (intent.category === "career_switch" && c.currentRoleMatch && c.pastFromRoleMatch) score += w.madeSwitch;
  if (c.cityMatch) score += w.city;
  else if (c.countryMatch) score += w.country;
  if (c.studyProgramMatch) score += w.studyProgram;
  else if (c.studyTypeMatch) score += w.studyType;
  if (c.founderMatch) score += w.founder;
  score += Math.min(w.keywordMax, c.keywordHits.length * w.keywordEach);
  if (relevantOpenTo(intent, c).length > 0) score += w.openTo;
  return score;
}

export function qualifies(intent: MatchIntent, c: MatchCandidateSignals): boolean {
  const primary = primarySignalsForIntent(intent);
  if (primary.length === 0) return false;
  return primary.some((s) => has(c, s));
}

/** Filter to qualifying candidates, score, sort, and keep the top `limit`. */
export function rankMatches(
  intent: MatchIntent,
  candidates: readonly MatchCandidateSignals[],
  limit: number = MATCH_RESULT_LIMIT
): ScoredMatch[] {
  const scored: ScoredMatch[] = [];
  for (const candidate of candidates) {
    if (!qualifies(intent, candidate)) continue;
    const reasons = buildMatchReasons(intent, candidate);
    if (reasons.length === 0) continue;
    scored.push({
      candidate,
      score: scoreCandidate(intent, candidate),
      reasons,
      whyThem: reasons
        .slice(0, 3)
        .map((r) => r.text)
        .join(" · "),
      relevantOpenTo: relevantOpenTo(intent, candidate)
    });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.candidate.completenessScore - a.candidate.completenessScore ||
      (a.candidate.personId < b.candidate.personId ? -1 : a.candidate.personId > b.candidate.personId ? 1 : 0)
  );
  return scored.slice(0, Math.max(0, limit));
}

/** True when the intent has nothing the matcher can search on (UI should ask for detail). */
export function intentNeedsDetail(intent: MatchIntent): boolean {
  return primarySignalsForIntent(intent).length === 0;
}
