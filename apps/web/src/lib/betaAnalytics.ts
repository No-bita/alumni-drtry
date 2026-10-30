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
  // Home (analytics screen)
  "home_ask_submitted",
  "home_example_clicked",
  "home_browse_clicked",
  "home_wall_post_clicked",
  "home_notes_clicked",
  "home_checklist_clicked",
  "home_checklist_dismissed",
  "home_answer_key_opened",
  "home_answer_key_dismissed",
  // Growth
  "invite_opened",
  "invite_copied",
  "invite_whatsapp_shared",
  // Cities v1
  "cities_viewed",
  "cities_arrival_prompt_shown",
  "cities_coffee_full_shown",
  "cities_city_help_on",
  "cities_city_updated",
] as const;

export type BetaUsageEventType = (typeof BETA_USAGE_EVENT_TYPES)[number];

/**
 * Events the API stores for the admin analytics screen (mirrors the API's RECORDED_EVENT_TYPES).
 * Others are not sent at all. The API also drops free-text metadata and caps events per person.
 */
export const RECORDED_EVENT_TYPES: ReadonlySet<BetaUsageEventType> = new Set<BetaUsageEventType>([
  "onboarding_started",
  "onboarding_step_advanced",
  "onboarding_validation_error",
  "onboarding_completed",
  "notifications_panel_opened",
  "notification_item_clicked",
  "search_executed",
  "search_zero_results",
  "search_filters_changed",
  "search_load_more_clicked",
  "home_ask_submitted",
  "home_example_clicked",
  "home_browse_clicked",
  "home_wall_post_clicked",
  "home_notes_clicked",
  "home_checklist_clicked",
  "home_checklist_dismissed",
  "home_answer_key_opened",
  "home_answer_key_dismissed",
  "invite_opened",
  "invite_copied",
  "invite_whatsapp_shared",
  "cities_viewed",
  "cities_arrival_prompt_shown",
  "cities_coffee_full_shown",
  "cities_city_help_on",
  "cities_city_updated",
]);

type Sender = (body: { eventType: BetaUsageEventType; route: string; metadata: Record<string, unknown> }) => void;

const defaultSender: Sender = (body) => {
  void api.post("/v1/analytics/beta-usage-event", body).catch(() => undefined);
};

/** Unit tests run without a network: events are dropped unless a test installs a sender. */
let sender: Sender | null = import.meta.env.MODE === "test" ? null : defaultSender;

/** Tests only: capture events instead of sending them. Pass null to drop them again. */
export function setUsageEventSenderForTests(next: Sender | null): void {
  sender = next;
}

/** Fire-and-forget usage event for the analytics screen. Never throws, never blocks the UI. */
export function trackBetaUsageEvent(eventType: BetaUsageEventType, metadata?: Record<string, unknown>): void {
  if (!RECORDED_EVENT_TYPES.has(eventType) || !sender) return;
  try {
    const route = typeof window === "undefined" ? "" : window.location.pathname;
    sender({ eventType, route: route || "/", metadata: metadata ?? {} });
  } catch {
    /* analytics must never break the app */
  }
}
