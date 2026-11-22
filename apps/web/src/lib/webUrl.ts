/**
 * An ordinary web link: http or https, a real host name, no spaces. Must match apps/api `lib/webUrl.ts`.
 * Anything else (javascript:, data:, mailto:, file:, a bare word) is refused.
 */
export function isWebUrl(value: string, maxLength: number): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > maxLength || !/^https?:\/\//i.test(v) || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const PROFILE_LINK_URL_MAX = 2048;

/**
 * The value to put in a saved link's href, or null when it isn't a web link. The server and database
 * only store web links; this is the last guard so nothing else can ever become clickable.
 */
export function safeWebHref(url: string | null | undefined): string | null {
  return url && isWebUrl(url, PROFILE_LINK_URL_MAX) ? url.trim() : null;
}
