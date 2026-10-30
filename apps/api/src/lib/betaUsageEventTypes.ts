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
  // Home (analytics screen, migration 050)
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
  "cities_nudge_sent",
] as const;

export type BetaUsageEventType = (typeof BETA_USAGE_EVENT_TYPES)[number];

/**
 * Events that are actually stored (approved for the analytics screen). Anything else is accepted
 * and dropped, so older app builds that still send other events do no harm.
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
  "cities_nudge_sent",
]);

/** Metadata keys we keep; everything else (free text such as a search query) is dropped. */
const METADATA_KEYS = new Set([
  "stage", "questionId", "questionIndex", "stepIndex", "source", "key", "kind",
  "link", "surface", "count", "category", "resultsCount", "via", "role"
]);

/** Keep only short, known, primitive metadata values: no free text ever reaches the table. */
export function sanitizeEventMetadata(raw: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!METADATA_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value.length <= 64) out[key] = value;
  }
  return out;
}

/** Per-person cap on recorded events (in-memory, per API instance). */
export const USAGE_EVENTS_PER_MINUTE = 120;
/** Usage events older than this are deleted by the hourly housekeeping tick. */
export const USAGE_EVENT_RETENTION_DAYS = 365;

export class UsageEventRateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly perMinute = USAGE_EVENTS_PER_MINUTE,
    private readonly now: () => number = Date.now
  ) {}

  /** True when this person may record one more event now. */
  allow(personId: string): boolean {
    const t = this.now();
    const entry = this.hits.get(personId);
    if (!entry || t - entry.windowStart >= 60_000) {
      this.hits.set(personId, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.prune(t);
      return true;
    }
    if (entry.count >= this.perMinute) return false;
    entry.count += 1;
    return true;
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= 60_000) this.hits.delete(k);
  }
}
