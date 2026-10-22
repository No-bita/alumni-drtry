/**
 * Accepts absolute http(s) URLs or host/path input (prefixed with https://).
 * Rejects explicit non-http(s) schemes (e.g. ftp://, javascript:) instead of prefixing them.
 * Mirrors the web composer's rule in apps/web PostBulletinFlow.
 */
export function tryNormalizeListingUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t)?.[1];
  if (scheme && !/^https?$/i.test(scheme)) {
    // host:port[/path] input (e.g. example.com:8080/jobs) is not a scheme — allow prefixing.
    const rest = t.slice(scheme.length + 1);
    if (!/^\d+(\/|$)/.test(rest)) return null;
  }
  const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}
