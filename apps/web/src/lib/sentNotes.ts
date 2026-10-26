import { assertApiGet } from "./assertApiGet";

/** GET /v1/contact-requests/sent */
export type SentNote = {
  id: string;
  recipientPersonId: string;
  recipientFullName: string | null;
  message: string;
  status: "pending" | "accepted" | "declined";
  /** Only set once accepted. */
  recipientContactShared: string | null;
  createdAt: string;
  respondedAt: string | null;
};

export type SentNotesResponse = { requests: SentNote[] };

export const SENT_NOTES_QUERY_KEY = ["contact-requests", "sent"] as const;

export function fetchSentNotes(signal: AbortSignal): Promise<SentNotesResponse> {
  return assertApiGet<SentNotesResponse>("/v1/contact-requests/sent", signal);
}

export function sentNoteStatusLabel(note: Pick<SentNote, "status">): string {
  switch (note.status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    default:
      return "Waiting for reply";
  }
}

/** "Replied to 4 of 5 notes · usually within 2 days" — only called when stats exist. */
export function replyStatsLine(stats: { total: number; replied: number; medianDays: number | null }): string {
  const notes = stats.total === 1 ? "note" : "notes";
  const base = `Replied to ${stats.replied} of ${stats.total} ${notes}`;
  if (stats.medianDays === null) return base;
  const days = stats.medianDays === 1 ? "1 day" : `${stats.medianDays} days`;
  return `${base} · usually within ${days}`;
}
