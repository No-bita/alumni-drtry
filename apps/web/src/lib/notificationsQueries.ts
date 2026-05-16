import { useQuery } from "@tanstack/react-query";
import type { NotificationsResponse, NotificationsSummaryResponse } from "../api/client";
import { assertApiGet } from "./assertApiGet";
import { queryKeys } from "./queryKeys";

/** Poll for new messages and other activity while the user is signed in. */
export const NOTIFICATIONS_POLL_MS = 30_000;

export function useNotificationsSummary(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.summary(),
    queryFn: ({ signal }) => assertApiGet<NotificationsSummaryResponse>("/v1/notifications/summary", signal),
    enabled,
    refetchInterval: enabled ? NOTIFICATIONS_POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}

export function useNotificationsList(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: ({ signal }) => assertApiGet<NotificationsResponse>("/v1/notifications", signal),
    enabled,
    refetchInterval: enabled ? NOTIFICATIONS_POLL_MS : false,
    refetchIntervalInBackground: true,
  });
}
