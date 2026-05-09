# Beta Analytics Launch Playbook

This document defines the canonical funnel, event taxonomy, KPI formulas, and weekly review rhythm for beta.

## Canonical Funnel (24h view)

1. `invite_success`
2. `onboarding_started`
3. `onboarding_completed`
4. `search_executed`
5. `profile_clicked`
6. High-intent action (`thread_created` or `intentcast_posted`)

## KPI Formulas

- **Onboarding completion rate (24h)**  
  `onboarding_completed_24h / onboarding_started_24h * 100`
- **Discovery CTR (24h)**  
  `profile_clicked_24h / search_executed_24h * 100`
- **Connection conversion rate (24h)**  
  `thread_created_24h / profile_viewed_24h * 100`
- **Intentcast response rate (24h)**  
  `intentcast_responded_24h / intentcast_posted_24h * 100`
- **Active users (24h / 7d)**  
  `distinct person_id with any beta_usage_event in time window`
- **Repeat users (7d)**  
  `distinct person_id with >=2 beta_usage_events in last 7 days`

## Event Taxonomy Contract

### Onboarding
- `onboarding_started`
- `onboarding_step_advanced`
- `onboarding_validation_error`
- `onboarding_completed`

### Discovery/Search
- `search_executed`
- `search_zero_results`
- `search_filters_changed`
- `search_load_more_clicked`
- `profile_clicked`
- `profile_viewed`

### Connection
- `profile_reachout_started`
- `profile_reachout_submitted`
- `thread_created`
- `thread_message_sent`
- `message_reply_started`
- `thread_closed`

### Intentcast/Bulletin
- `intentcast_posted`
- `intentcast_responded`
- `intentcast_compose_opened`
- `intentcast_step_advanced`
- `intentcast_publish_failed`
- `intentcast_reply_cta_clicked`

### Notifications/Widgets
- `notifications_panel_opened`
- `notification_item_clicked`
- `messaging_widget_opened`

## Event Payload Guardrails

- Keep payloads lightweight and explicit:
  - `route`
  - `source` / `source_surface`
  - `stepIndex` / `questionId` (for onboarding)
  - `resultCount` (for search)
  - `errorCode` or `message` (for validation failures)
- Avoid large nested payloads or user-generated long text.

## Weekly Beta Review Rhythm

Run once per week with product + engineering:

1. **Activation review**
   - onboarding start/completion and drop-offs
   - top validation errors by count
2. **Discovery quality review**
   - discovery CTR
   - zero-result searches and dominant query/filter patterns
3. **Connection and intent liquidity**
   - profile view -> thread conversion
   - intentcast post -> response conversion
4. **Retention pulse**
   - active users 24h vs 7d
   - repeat users (7d)
5. **Action log**
   - choose top 3 product fixes
   - define owner and expected metric movement for next week
