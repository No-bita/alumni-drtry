/**
 * Build (`/intent/build`) and Events (`/events`) are dev-only placeholders.
 * Production builds omit nav links and redirect these routes to `/home`.
 */
export const isDevHubPagesEnabled = import.meta.env.DEV;
