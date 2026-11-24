import { useQuery } from "@tanstack/react-query";
import type { ContactRequestsInboxResponse } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes } from "../lib/sentNotes";

/**
 * Whether the signed-in member has any reachouts (waiting for their reply or sent).
 * Same query keys the reachout cards use, so callers share the cache and add no
 * extra requests. `settled` is false until both answers arrive, so pages can keep
 * their default layout instead of flashing a reorder.
 */
export function useHasReachouts(enabled: boolean): { settled: boolean; hasAny: boolean } {
  const inbox = useQuery({
    queryKey: ["contact-requests", "inbox"],
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
    enabled,
  });
  const sent = useQuery({
    queryKey: SENT_NOTES_QUERY_KEY,
    queryFn: ({ signal }) => fetchSentNotes(signal),
    enabled,
  });
  return {
    settled: inbox.isSuccess && sent.isSuccess,
    hasAny: (inbox.data?.requests.length ?? 0) > 0 || (sent.data?.requests.length ?? 0) > 0,
  };
}
