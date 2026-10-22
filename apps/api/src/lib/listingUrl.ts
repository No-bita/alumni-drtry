/**
 * Accepts absolute http(s) URLs or host/path input (prefixed with https://).
 * Rejects explicit non-http(s) schemes (e.g. ftp://, javascript:) instead of prefixing them.
 * Mirrors the web composer's rule in apps/web PostBulletinFlow.
 */
export function tryNormalizeListingUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(t)?.[1];
  if (scheme && !/^https?$/i.test(scheme)) return null;
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}
