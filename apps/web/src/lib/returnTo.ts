/**
 * "Take me back where I was after signing in." When a signed-out member opens an app page, RequireAuth
 * remembers that page here and sends them to /login. After sign-in (email code, email link, Google) the
 * app goes back to it instead of Home.
 *
 * Kept in localStorage for 30 minutes so an email link opened in a new tab of the same browser still works.
 * Only in-app paths are accepted ("/profiles/123?x=1"): never another site, never /login itself (no loops).
 */
const KEY = "alma.returnTo";
const TTL_MS = 30 * 60 * 1000;

/** Never return to these: sign-in screens themselves, or flows that pick their own next step. */
const NEVER = ["/login", "/auth/verify", "/onboarding", "/wa", "/w/"];

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim();
  // In-app absolute path only: "/x", not "//evil.com", not "/\\evil", not "https://…".
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.length > 1000) return null;
  for (let i = 0; i < path.length; i += 1) if (path.charCodeAt(i) < 32) return null;
  const bare = path.split(/[?#]/)[0] ?? "";
  if (bare === "/" || NEVER.some((n) => (n.endsWith("/") ? bare.startsWith(n) : bare === n || bare.startsWith(`${n}/`)))) return null;
  return path;
}

export function rememberReturnTo(path: string): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() }));
  } catch {
    /* storage can be unavailable (private mode); then sign-in just goes Home */
  }
}

/** The remembered page (once): read and clear. Null if none, expired or unsafe. */
export function takeReturnTo(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) return null;
    return safeReturnPath(parsed.path);
  } catch {
    return null;
  }
}
