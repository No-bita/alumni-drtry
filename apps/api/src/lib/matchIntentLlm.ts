/**
 * Optional LLM question parser for Ask → Match (off by default).
 *
 * Contract: only the question text is sent to a provider — never alumni data. The provider's
 * output is validated against a strict schema; anything invalid, slow, or failing returns null
 * and the caller falls back to the rules parser (`parseMatchQuestion`).
 *
 * No provider ships in this change. To enable one later, implement `MatchIntentLlmProvider`,
 * pass it to `MatchService`, and set MATCH_LLM_ENABLED=true.
 */
import { z } from "zod";
import { MATCH_CATEGORIES, STUDY_PROGRAMS, type MatchIntent } from "./matchIntent.js";

export interface MatchIntentLlmProvider {
  /** Return raw JSON for the question. Must honour `signal` for timeouts. */
  extractIntent(question: string, signal: AbortSignal): Promise<unknown>;
}

const shortText = z.string().trim().min(1).max(120).nullable();

export const llmIntentSchema = z
  .object({
    category: z.enum(MATCH_CATEGORIES).nullable(),
    company: shortText,
    role: shortText,
    fromRole: shortText,
    city: shortText,
    country: shortText,
    studyPrograms: z.array(z.enum(STUDY_PROGRAMS)).max(3),
    keywords: z.array(z.string().trim().min(2).max(40)).max(6)
  })
  .strict();

export const MATCH_LLM_TIMEOUT_MS = 3000;

export async function parseQuestionWithLlm(
  provider: MatchIntentLlmProvider,
  question: string,
  timeoutMs: number = MATCH_LLM_TIMEOUT_MS
): Promise<MatchIntent | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const raw = await provider.extractIntent(question, controller.signal);
    const parsed = llmIntentSchema.safeParse(raw);
    if (!parsed.success) return null;
    return { ...parsed.data, source: "llm" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
