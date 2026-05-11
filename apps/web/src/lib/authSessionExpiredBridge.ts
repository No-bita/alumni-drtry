/** Listener wired inside Router (`AuthSessionExpiredRegistrar`) — redirects on stale expired cookie while UI still thinks user is signed in. */

let listener: (() => void) | null = null;

export function setAuthSessionExpiredListener(fn: (() => void) | null): void {
  listener = fn;
}

/** Invoke after API rejects cookie/session (`AUTH_UNAUTHORIZED`). */
export function notifyAuthSessionExpired(): void {
  listener?.();
}
