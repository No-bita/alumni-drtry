/**
 * Note form (approved): a note is a referral ask or an advice ask, with required fields.
 * Same rules as the API (apps/api/src/lib/noteDetails.ts); the API checks them again.
 */
import type { MatchCategory } from "./matchApi";

export type NotePurpose = "referral" | "advice";

export const NOTE_FIT_MIN = 80;
export const NOTE_FIT_MAX = 500;
export const NOTE_QUESTION_MIN = 80;
export const NOTE_QUESTION_MAX = 1000;
export const NOTE_SHORT_FIELD_MAX = 120;
export const NOTE_URL_MAX = 500;

export const ADVICE_TOPICS = ["interview_prep", "career_switch", "higher_studies", "relocation", "founder_advice", "other"] as const;
export type AdviceTopic = (typeof ADVICE_TOPICS)[number];

export const ADVICE_TOPIC_LABELS: Record<AdviceTopic, string> = {
  interview_prep: "Interview prep",
  career_switch: "Career switch",
  higher_studies: "Higher studies",
  relocation: "Moving cities",
  founder_advice: "Starting up",
  other: "Other",
};

/** Example question per topic, shown as the placeholder. */
export const ADVICE_TOPIC_HINTS: Record<AdviceTopic, string> = {
  interview_prep: "e.g. I have a PM interview at their company next week. What does the product round focus on?",
  career_switch: "e.g. I'm a data analyst moving into product. Which skills mattered most when you switched?",
  higher_studies: "e.g. I'm choosing between an MS in the US and Germany for robotics. How did you decide?",
  relocation: "e.g. I'm moving to Pune in January for work near Hinjewadi. Which areas should I look at?",
  founder_advice: "e.g. We're pre-seed in B2B logistics. How did you find your first ten customers?",
  other: "One specific question they can answer.",
};

export type ReferralFields = { jobUrl: string; role: string; company: string; fit: string; resumeUrl: string };
export type AdviceFields = { topic: AdviceTopic | null; question: string };

export type NoteDetails =
  | { purpose: "referral"; jobUrl: string; role: string; company: string; fit: string; resumeUrl: string | null }
  | { purpose: "advice"; topic: AdviceTopic; question: string };

/** The topic an Ask category points to ("referral" and unknown have none). */
export function topicForCategory(category: MatchCategory | null | undefined): AdviceTopic | null {
  if (!category || category === "referral") return null;
  return (ADVICE_TOPICS as readonly string[]).includes(category) ? (category as AdviceTopic) : null;
}

export function isWebUrl(value: string): boolean {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v) || v.length > NOTE_URL_MAX || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

const oneLine = (v: string) => v.replace(/\s+/g, " ").trim();

/** What still stops a referral from being previewed (empty when it's ready). */
export function referralProblems(f: ReferralFields): string[] {
  const out: string[] = [];
  if (!isWebUrl(f.jobUrl)) out.push("job link");
  if (!oneLine(f.role) || oneLine(f.role).length > NOTE_SHORT_FIELD_MAX) out.push("role");
  if (!oneLine(f.company) || oneLine(f.company).length > NOTE_SHORT_FIELD_MAX) out.push("company");
  const fit = f.fit.trim().length;
  if (fit < NOTE_FIT_MIN || fit > NOTE_FIT_MAX) out.push("why you're a fit");
  if (f.resumeUrl.trim() && !isWebUrl(f.resumeUrl)) out.push("résumé link");
  return out;
}

export function adviceProblems(f: AdviceFields): string[] {
  const out: string[] = [];
  if (!f.topic) out.push("topic");
  const q = f.question.trim().length;
  if (q < NOTE_QUESTION_MIN || q > NOTE_QUESTION_MAX) out.push("question");
  return out;
}

export function referralDetails(f: ReferralFields): NoteDetails {
  return {
    purpose: "referral",
    jobUrl: f.jobUrl.trim(),
    role: oneLine(f.role),
    company: oneLine(f.company),
    fit: f.fit.trim(),
    resumeUrl: f.resumeUrl.trim() || null,
  };
}

export function adviceDetails(f: AdviceFields): NoteDetails {
  return { purpose: "advice", topic: f.topic ?? "other", question: f.question.trim() };
}

/** "Referral request" or "Advice · Interview prep": the label on a note. */
export function noteLabel(d: NoteDetails): string {
  return d.purpose === "referral" ? "Referral request" : `Advice · ${ADVICE_TOPIC_LABELS[d.topic] ?? "Other"}`;
}

/** Counter under a long field: "42 / 80 characters minimum", then "120 / 500". */
export function lengthCounter(length: number, min: number, max: number): string {
  return length < min ? `${length} / ${min} characters minimum` : `${length} / ${max}`;
}

/** Short "Batch '24" (empty without a year). */
export function batchLabel(year: number | null | undefined): string {
  return year ? `Batch '${String(year).slice(-2)}` : "";
}
