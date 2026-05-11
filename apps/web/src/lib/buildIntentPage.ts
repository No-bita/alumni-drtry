/**
 * Build intent hub (`/intent/build`).
 *
 * Stays **off in production** until you explicitly set `VITE_ENABLE_BUILD_INTENT_PAGE=true`
 * on the deploy environment (separate from other hub routes gated by `devHubPages`).
 * Local dev (`import.meta.env.DEV`): always enabled.
 */
export const isBuildIntentPageEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_BUILD_INTENT_PAGE === "true";
