// Mirrors PostBulletinFlow.tryNormalizeExternalHttpUrl and the API listingUrl helper (keep in sync).
export function tryNormalizeListingUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(t)?.[1];
  if (scheme && !/^https?$/i.test(scheme)) {
    // host:port[/path] input (e.g. example.com:8080/jobs) is not a scheme - allow prefixing,
    // but only when the part before ':' looks like a host; ftp:21/x style input is rejected.
    const rest = t.slice(scheme.length + 1);
    if (!/^\d+(\/|$)/.test(rest) || !scheme.includes(".")) return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const hostname = parsed.hostname.toLowerCase();
  if (
    !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
  ) {
    return null;
  }
  parsed.hostname = hostname;
  return parsed.toString();
}
