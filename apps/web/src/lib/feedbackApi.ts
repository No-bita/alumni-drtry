import { api } from "../api/client";
import { assertApiGet } from "./assertApiGet";

/*
 * Member feedback: POST /v1/feedback submits, GET /v1/admin/feedback lists for admins.
 * The member's identity is always attached server-side; the UI says "private", never "anonymous".
 */
export interface AdminFeedbackEntry {
  id: string;
  authorFullName: string | null;
  message: string;
  createdAt: string;
}

export const adminFeedbackQueryKey = ["admin", "feedback"] as const;

export async function fetchAdminFeedback(signal: AbortSignal): Promise<AdminFeedbackEntry[]> {
  const data = await assertApiGet<{ feedback: AdminFeedbackEntry[] }>("/v1/admin/feedback", signal);
  return data.feedback;
}

export function submitFeedback(message: string) {
  return api.post<{ feedback: { id: string; createdAt: string } }>("/v1/feedback", { message });
}
