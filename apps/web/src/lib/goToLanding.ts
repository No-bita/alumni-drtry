/**
 * Leave the app for the public landing page (site root, outside the /app base).
 * Uses replace, not assign: the signed-out beat must not stay in browser history,
 * so Back from the landing never replays it or lands on a dead signed-in page.
 */
export function goToLanding(): void {
  window.location.replace("/");
}
