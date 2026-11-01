/**
 * Note form (approved): every note is either a referral ask or an advice ask, with required fields.
 * The server checks the fields, builds the readable message from them, and stores both.
 */
import { z } from "zod";
import type { MatchCategory } from "./matchIntent.js";

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
  other: "Other"
};

export type ReferralDetails = {
  purpose: "referral";
  jobUrl: string;
  role: string;
  company: string;
  fit: string;
  resumeUrl: string | null;
};
export type AdviceDetails = { purpose: "advice"; topic: AdviceTopic; question: string };
export type NoteDetails = ReferralDetails | AdviceDetails;

/** Loose shape only: field rules are checked by {@link validateNoteDetails} so each failure gets its own code. */
export const noteInputSchema = z.object({
  purpose: z.string().max(40),
  jobUrl: z.string().max(2000).optional().nullable(),
  role: z.string().max(1000).optional().nullable(),
  company: z.string().max(1000).optional().nullable(),
  fit: z.string().max(5000).optional().nullable(),
  resumeUrl: z.string().max(2000).optional().nullable(),
  topic: z.string().max(40).optional().nullable(),
  question: z.string().max(10000).optional().nullable()
});
export type NoteInput = z.infer<typeof noteInputSchema>;

export class NoteDetailsError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const tidy = (v: string | null | undefined) => (v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const oneLine = (v: string | null | undefined) => tidy(v).replace(/\s+/g, " ");

export function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || value.length > NOTE_URL_MAX || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Checks the fields and returns them cleaned, or throws {@link NoteDetailsError}. */
export function validateNoteDetails(input: NoteInput | null | undefined): NoteDetails {
  if (!input || (input.purpose !== "referral" && input.purpose !== "advice")) {
    throw new NoteDetailsError("CONTACT_REQUEST_PURPOSE_REQUIRED", "Choose what you need: a referral or advice.");
  }
  if (input.purpose === "referral") {
    const jobUrl = tidy(input.jobUrl);
    if (!isWebUrl(jobUrl)) {
      throw new NoteDetailsError("CONTACT_REQUEST_JOB_LINK_REQUIRED", "Add the job link (starting with https://). No specific opening? Ask for advice instead.");
    }
    const role = oneLine(input.role);
    const company = oneLine(input.company);
    if (!role || role.length > NOTE_SHORT_FIELD_MAX) {
      throw new NoteDetailsError("CONTACT_REQUEST_ROLE_REQUIRED", `Add the role (up to ${NOTE_SHORT_FIELD_MAX} characters).`);
    }
    if (!company || company.length > NOTE_SHORT_FIELD_MAX) {
      throw new NoteDetailsError("CONTACT_REQUEST_COMPANY_REQUIRED", `Add the company (up to ${NOTE_SHORT_FIELD_MAX} characters).`);
    }
    const fit = tidy(input.fit);
    if (fit.length < NOTE_FIT_MIN || fit.length > NOTE_FIT_MAX) {
      throw new NoteDetailsError("CONTACT_REQUEST_FIT_LENGTH", `Say why you're a fit in ${NOTE_FIT_MIN} to ${NOTE_FIT_MAX} characters.`);
    }
    const resume = tidy(input.resumeUrl);
    if (resume && !isWebUrl(resume)) {
      throw new NoteDetailsError("CONTACT_REQUEST_RESUME_LINK_INVALID", "The résumé link must start with https:// (or leave it empty).");
    }
    return { purpose: "referral", jobUrl, role, company, fit, resumeUrl: resume || null };
  }
  const topic = tidy(input.topic) as AdviceTopic;
  if (!ADVICE_TOPICS.includes(topic)) {
    throw new NoteDetailsError("CONTACT_REQUEST_TOPIC_REQUIRED", "Pick a topic for your question.");
  }
  const question = tidy(input.question);
  if (question.length < NOTE_QUESTION_MIN || question.length > NOTE_QUESTION_MAX) {
    throw new NoteDetailsError(
      "CONTACT_REQUEST_QUESTION_LENGTH",
      `Write your question in ${NOTE_QUESTION_MIN} to ${NOTE_QUESTION_MAX} characters.`
    );
  }
  return { purpose: "advice", topic, question };
}

/** The readable note everyone sees (Notifications, email, WhatsApp, reminders). */
export function composeNoteMessage(d: NoteDetails): string {
  if (d.purpose === "referral") {
    const lines = [`Referral request: ${d.role} at ${d.company}`, "", `Why I'm a fit: ${d.fit}`, "", `Job: ${d.jobUrl}`];
    if (d.resumeUrl) lines.push(`Résumé: ${d.resumeUrl}`);
    return lines.join("\n");
  }
  return `Advice · ${ADVICE_TOPIC_LABELS[d.topic]}\n\n${d.question}`;
}

/** Category kept for analytics (approved mapping; "other" has none). */
export function noteCategory(d: NoteDetails): MatchCategory | null {
  if (d.purpose === "referral") return "referral";
  return d.topic === "other" ? null : d.topic;
}
