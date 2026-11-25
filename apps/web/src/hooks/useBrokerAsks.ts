import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { brokerKeys, fetchBrokerAsks, type BrokerAsk } from "../lib/broker";
import { queryKeys } from "../lib/queryKeys";

/**
 * Brokered asks waiting for the viewer, with Accept / Decline. Shared by Notifications and Home's
 * Requests for you. The asker's "seen" step: on Notifications (full cards) showing an ask counts as
 * seeing it; Home shows a compact row first, so there an ask is seen when it is opened (`markSeen`).
 */
export function useBrokerAsks(enabled: boolean, { seenOnShow = true }: { seenOnShow?: boolean } = {}) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: brokerKeys.asks(), queryFn: ({ signal }) => fetchBrokerAsks(signal), enabled });
  const asks = useMemo(() => q.data ?? [], [q.data]);
  const seenSent = useRef(new Set<string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const markSeen = useCallback((a: BrokerAsk) => {
    if (a.status !== "asked" || a.seenAt || seenSent.current.has(a.askId)) return;
    seenSent.current.add(a.askId);
    void api.post(`/v1/broker-asks/${a.askId}/seen`);
  }, []);

  useEffect(() => {
    if (!seenOnShow) return;
    for (const a of asks) markSeen(a);
  }, [asks, seenOnShow, markSeen]);

  const answer = async (a: BrokerAsk, action: "accept" | "decline") => {
    setBusy(a.askId);
    setErrors((e) => ({ ...e, [a.askId]: "" }));
    const { error } = await api.post(`/v1/broker-asks/${a.askId}/respond`, { action });
    setBusy(null);
    if (error) {
      setErrors((e) => ({ ...e, [a.askId]: error.message ?? "Couldn't save your answer. Try again." }));
      if (error.code === "BROKER_ALREADY_HELPED" || error.code === "BROKER_REQUEST_CLOSED") void q.refetch();
      return;
    }
    if (action === "decline") setHidden((h) => new Set(h).add(a.askId));
    void queryClient.invalidateQueries({ queryKey: brokerKeys.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  return {
    visible: asks.filter((a) => !hidden.has(a.askId)),
    settled: !enabled || q.isSuccess || q.isError,
    busy,
    errors,
    answer,
    markSeen,
  };
}

