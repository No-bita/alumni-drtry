/**
 * Hub placeholders (`/events`, `/intent/build`) plus Location hub “Explore events” and “Upcoming events”.
 * Always on in dev (`import.meta.env.DEV`).
 * In production builds, on by default so deployed UI matches local; set `VITE_DISABLE_DEV_HUB_PAGES=true` to hide.
 */
export const isDevHubPagesEnabled =
  import.meta.env.DEV || import.meta.env.VITE_DISABLE_DEV_HUB_PAGES !== "true";
