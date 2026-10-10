/**
 * Hub placeholders (`/events`, `/intent/build`) plus Location hub "Explore events" and "Upcoming events".
 * Always on in dev (`import.meta.env.DEV`).
 * In production builds these are OFF: they are placeholders, and a nav tab that leads to a
 * "coming soon" page makes the whole app feel unfinished. Set `VITE_ENABLE_DEV_HUB_PAGES=true`
 * on the deploy environment to show them again.
 */
export const isDevHubPagesEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_HUB_PAGES === "true";
