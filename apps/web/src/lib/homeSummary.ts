import { assertApiGet } from "./assertApiGet";
import type { SentNote } from "./sentNotes";

/** GET /v1/home/summary — people Match can return to you, their current employers, and referrals. */
export type HomeSummary = {
  alumni: number;
  companies: number;
  openToReferrals: number;
};

export const HOME_SUMMARY_QUERY_KEY = ["home", "summary"] as const;

export function fetchHomeSummary(signal: AbortSignal): Promise<HomeSummary> {
  return assertApiGet<HomeSummary>("/v1/home/summary", signal);
}

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * "[N] alumni across [N] companies can help · [N] open to referrals".
 * Any part that would read 0 is left out; null when there is nothing true and non-zero to say.
 */
export function reassuranceLine(s: HomeSummary): string | null {
  if (s.alumni <= 0) return null;
  const people = s.alumni === 1 ? "1 alum" : `${fmt(s.alumni)} alumni`;
  const companies = s.companies === 1 ? "1 company" : `${fmt(s.companies)} companies`;
  const head = s.companies > 0 ? `${people} across ${companies}` : people;
  return s.openToReferrals > 0 ? `${head} · ${fmt(s.openToReferrals)} open to referrals` : head;
}

/** "Your notes · 1 waiting for reply · 2 accepted" parts; null when nothing is waiting or accepted. */
export function sentNotesSummary(notes: readonly Pick<SentNote, "status">[]): string[] | null {
  const waiting = notes.filter((n) => n.status === "pending").length;
  const accepted = notes.filter((n) => n.status === "accepted").length;
  if (waiting === 0 && accepted === 0) return null;
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${waiting} waiting for reply`);
  if (accepted > 0) parts.push(`${accepted} accepted`);
  return parts;
}
