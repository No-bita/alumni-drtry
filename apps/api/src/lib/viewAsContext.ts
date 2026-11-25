import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request flag: is an admin viewing as a member (read-only) on this request? Lets deep code skip
 * housekeeping writes, emails and counters without threading a flag through every call. Outside a
 * request (jobs, scripts) it is always false. Set by `authenticate` in app.ts; no dependencies on purpose.
 */
const store = new AsyncLocalStorage<{ viewAs: boolean }>();

/** Runs the rest of one request inside its own context (an onRequest hook in app.ts). */
export function runRequestContext(next: () => void): void {
  store.run({ viewAs: false }, next);
}

/** Marks the current request as an admin viewing as a member. */
export function markViewAsRequest(): void {
  const ctx = store.getStore();
  if (ctx) ctx.viewAs = true;
}

/** True while handling a request made under an admin's view-as session. */
export function isViewAsRequest(): boolean {
  return store.getStore()?.viewAs === true;
}
