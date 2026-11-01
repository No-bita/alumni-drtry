import { api, type ApiError } from "../api/client";
import type { BulletinUiCategory } from "./bulletinPostCardUtils";
import type { OpenToOptionId } from "./openToPreferences";

/** Must match `MATCH_CATEGORIES` in apps/api/src/lib/matchIntent.ts. */
export const MATCH_CATEGORIES = [
  "referral",
  "interview_prep",
  "career_switch",
  "higher_studies",
  "relocation",
  "founder_advice",
] as const;
export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const MATCH_CATEGORY_LABELS: Record<MatchCategory, string> = {
  referral: "Referral",
  interview_prep: "Interview prep",
  career_switch: "Career switch",
  higher_studies: "Higher studies",
  relocation: "Moving cities",
  founder_advice: "Co-founder / startup advice",
};

export const MATCH_QUESTION_MIN = 3;
export const MATCH_QUESTION_MAX = 500;

export function isMatchCategory(value: unknown): value is MatchCategory {
  return typeof value === "string" && (MATCH_CATEGORIES as readonly string[]).includes(value);
}

export type MatchIntent = {
  category: MatchCategory | null;
  company: string | null;
  role: string | null;
  fromRole: string | null;
  city: string | null;
  country: string | null;
  studyPrograms: ("ms" | "mba" | "phd")[];
  keywords: string[];
  source: "rules" | "llm";
};

export type MatchReason = { key: string; text: string };

export type MatchResult = {
  id: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
  residenceCity: string | null;
  residenceCountry: string | null;
  whyThem: string;
  reasons: MatchReason[];
  openTo: OpenToOptionId[];
  relevantOpenTo: OpenToOptionId[];
  /** Latest status of the viewer's own note to this alum. */
  yourNote: "pending" | "accepted" | "declined" | null;
  /** Shown only when the alum has received enough notes (API decides). */
  replyStats: { total: number; replied: number; medianDays: number | null } | null;
};

export type MatchResponse = {
  intent: MatchIntent;
  needsDetail: boolean;
  results: MatchResult[];
  fallback: "post_bulletin" | null;
};

/** Editable chip fields. `null` = user cleared the value; absent = keep what the parser found. */
export type MatchOverrides = Partial<{
  category: MatchCategory | null;
  company: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
}>;

export type MatchOverrideField = keyof MatchOverrides;

const OVERRIDE_PARAM: Record<MatchOverrideField, string> = {
  category: "cat",
  company: "company",
  role: "role",
  city: "city",
  country: "country",
};

export type MatchUrlState = { question: string; overrides: MatchOverrides };

/** Read `/match?q=…&cat=…&company=…` — a present-but-empty param means "cleared". */
export function parseMatchUrlState(params: URLSearchParams): MatchUrlState {
  const question = (params.get("q") ?? "").trim().slice(0, MATCH_QUESTION_MAX);
  const overrides: MatchOverrides = {};
  for (const field of Object.keys(OVERRIDE_PARAM) as MatchOverrideField[]) {
    const key = OVERRIDE_PARAM[field];
    if (!params.has(key)) continue;
    const raw = (params.get(key) ?? "").trim().slice(0, 120);
    if (field === "category") {
      overrides.category = isMatchCategory(raw) ? raw : null;
    } else {
      overrides[field] = raw.length > 0 ? raw : null;
    }
  }
  return { question, overrides };
}

export function buildMatchSearch(state: MatchUrlState): string {
  const params = new URLSearchParams();
  params.set("q", state.question.trim());
  for (const field of Object.keys(OVERRIDE_PARAM) as MatchOverrideField[]) {
    if (!(field in state.overrides)) continue;
    const value = state.overrides[field];
    params.set(OVERRIDE_PARAM[field], value ?? "");
  }
  return `?${params.toString()}`;
}

export function matchHref(question: string): string {
  return `/match${buildMatchSearch({ question, overrides: {} })}`;
}

/** Bulletin category to preselect when a question found nobody. */
export function bulletinCategoryForMatch(category: MatchCategory | null): BulletinUiCategory {
  switch (category) {
    case "referral":
    case "interview_prep":
    case "career_switch":
      return "careers";
    case "relocation":
      return "relocation";
    case "founder_advice":
      return "startups";
    default:
      return "guidance";
  }
}

export class MatchRequestError extends Error {
  readonly code: string;
  readonly retryAfterSeconds?: number;
  constructor(error: ApiError, retryAfterSeconds?: number) {
    super(error.message ?? "Could not find matches.");
    this.code = error.code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function fetchMatches(state: MatchUrlState, signal?: AbortSignal): Promise<MatchResponse> {
  const body: { question: string; overrides?: MatchOverrides } = { question: state.question };
  if (Object.keys(state.overrides).length > 0) body.overrides = state.overrides;
  const res = await api.post<MatchResponse>("/v1/match", body, { signal });
  if (res.aborted) throw new DOMException("Aborted", "AbortError");
  if (res.error) throw new MatchRequestError(res.error, res.retryAfterSeconds);
  if (!res.data) throw new MatchRequestError({ code: "UNKNOWN", message: "Could not find matches." });
  return res.data;
}

export function matchErrorMessage(err: unknown): string {
  if (err instanceof MatchRequestError) {
    if (err.code === "DISCOVERY_RATE_LIMITED") return "Too many searches in a short time. Try again in a minute.";
    if (err.code === "NETWORK_ERROR") return err.message;
  }
  return "Couldn’t find matches right now. Try again.";
}

/** Copy for the "needs detail" state, by category. */
export function needsDetailPrompt(category: MatchCategory | null): { title: string; field: MatchOverrideField | null } {
  switch (category) {
    case "relocation":
      return { title: "Which city are you moving to?", field: "city" };
    case "referral":
      return { title: "Which company do you want a referral at?", field: "company" };
    case "interview_prep":
      return { title: "Which company or role is the interview for?", field: "company" };
    case "career_switch":
      return { title: "Which role are you switching into?", field: "role" };
    default:
      return { title: "Tell us a bit more: what kind of help, and a company, role or city.", field: null };
  }
}

/** Must match apps/api contact request limits. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
