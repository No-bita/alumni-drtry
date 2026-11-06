import { env } from "../config/env.js";

/**
 * The web app's base, no trailing slash, e.g. "https://almamatter.in/app".
 * WEB_APP_URL, else MAGIC_LINK_BASE_URL (older name), else APP_BASE_URL.
 * APP_BASE_URL stays the public API base (Google's callback is `${APP_BASE_URL}/v1/...`).
 */
export function webAppUrl(): string {
  return (env.WEB_APP_URL ?? env.MAGIC_LINK_BASE_URL ?? env.APP_BASE_URL).replace(/\/+$/, "");
}

/** The public API base, no trailing slash, e.g. "https://almamatter.in". */
export function apiPublicBaseUrl(): string {
  return env.APP_BASE_URL.replace(/\/+$/, "");
}
