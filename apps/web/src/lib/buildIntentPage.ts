/**
 * Business page (`/intent/business`, formerly `/intent/build`, which redirects).
 * Always available to signed-in members who pass the existing profile gate.
 * The former feature switch is preserved below for history, not consulted.
 */
export const isBuildIntentPageEnabled = true;

// Former gate, parked rather than deleted:
// import.meta.env.DEV || import.meta.env.VITE_ENABLE_BUILD_INTENT_PAGE === "true";
