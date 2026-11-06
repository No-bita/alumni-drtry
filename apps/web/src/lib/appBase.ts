/**
 * The app is served under a path (production: almamatter.in/app). Vite's `base` sets it; everything that builds a
 * URL outside React Router (public files, share links, analytics routes) goes through these helpers.
 * API calls are NOT under it: `/v1/...` stays at the site root.
 */

/** "/app" (no trailing slash), or "" when the app is served at the root. */
export const APP_BASE_PATH = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "");

/** A file from `public/`, e.g. publicAsset("media/camp_1.jpeg") → "/app/media/camp_1.jpeg". */
export function publicAsset(path: string): string {
  return `${APP_BASE_PATH}/${path.replace(/^\/+/, "")}`;
}

/** The app's absolute base for links people share, e.g. "https://almamatter.in/app". */
export function appBaseUrl(origin: string = typeof window === "undefined" ? "" : window.location.origin): string {
  return `${origin.replace(/\/+$/, "")}${APP_BASE_PATH}`;
}

/** Browser pathname → the router's pathname ("/app/home" → "/home"). */
export function stripAppBase(pathname: string): string {
  if (!APP_BASE_PATH) return pathname || "/";
  if (pathname === APP_BASE_PATH) return "/";
  if (pathname.startsWith(`${APP_BASE_PATH}/`)) return pathname.slice(APP_BASE_PATH.length) || "/";
  return pathname || "/";
}
