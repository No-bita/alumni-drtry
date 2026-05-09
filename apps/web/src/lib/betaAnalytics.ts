import { api } from "../api/client";

export const BETA_USAGE_EVENT_TYPES = [
  "search_executed",
  "profile_viewed",
  "profile_clicked",
  "thread_created",
  "thread_message_sent",
  "intentcast_posted",
  "intentcast_responded",
  "onboarding_started",
  "onboarding_step_advanced",
  "onboarding_validation_error",
  "onboarding_completed",
  "search_zero_results",
  "search_filters_changed",
  "search_load_more_clicked",
  "profile_reachout_started",
  "profile_reachout_submitted",
  "message_reply_started",
  "thread_closed",
  "intentcast_compose_opened",
  "intentcast_step_advanced",
  "intentcast_publish_failed",
  "intentcast_reply_cta_clicked",
  "notifications_panel_opened",
  "notification_item_clicked",
  "messaging_widget_opened",
] as const;

export type BetaUsageEventType = (typeof BETA_USAGE_EVENT_TYPES)[number];

export function trackBetaUsageEvent(eventType: BetaUsageEventType, metadata?: Record<string, unknown>): void {
  void api.post("/v1/analytics/beta-usage-event", {
    eventType,
    route: typeof window !== "undefined" ? window.location.pathname : "/",
    metadata: metadata ?? {},
  });
}
