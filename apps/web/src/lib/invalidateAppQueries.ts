import { queryClient } from "../queryClient";
import { queryKeys } from "./queryKeys";

/** After contact-request or notification-affecting mutations (accept/decline, etc.). */
export function invalidateNotificationRelatedQueries(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.all });
}

/** After creating a thread or changing thread state. */
export function invalidateConnectionThreadQueries(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
}
