import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationsResponse, type NotificationsSummaryResponse } from "../api/client";
import { assertApiGet } from "./assertApiGet";
import { invalidateNotificationRelatedQueries } from "./invalidateAppQueries";
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

/** "Mark all as seen": moves the seen watermark server-side, then refreshes list + badge. */
export function useMarkAllNotificationsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.post("/v1/notifications/mark-all-seen", {});
      if (error) throw new Error(error.message ?? error.code);
    },
    onSuccess: () => {
      invalidateNotificationRelatedQueries();
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
