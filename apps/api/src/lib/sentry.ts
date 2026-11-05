import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

let initialized = false;

/** Path without the query string (tokens, search terms and emails travel there). */
function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/** Drop query strings, cookies, headers, bodies and user details from anything sent to Sentry. */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  const extra = event.extra as Record<string, unknown> | undefined;
  if (extra && typeof extra.url === "string") extra.url = stripQuery(extra.url);
  if (event.transaction) event.transaction = stripQuery(event.transaction);
  return event;
}

export function initSentry(): void {
  if (env.NODE_ENV === "test" || !env.SENTRY_DSN?.trim()) {
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
    // Collect nothing about the request or the person automatically: no user info, cookies, headers,
    // query strings or bodies (this SDK version collects all of them by default).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false
    },
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent
  });
  initialized = true;
}

export function captureException(error: unknown, context?: { reqId?: string; method?: string; url?: string }): void {
  if (!initialized) {
    return;
  }
  Sentry.withScope((scope) => {
    if (context?.reqId) scope.setTag("reqId", context.reqId);
    if (context?.method) scope.setTag("method", context.method);
    if (context?.url) scope.setExtra("url", stripQuery(context.url));
    Sentry.captureException(error);
  });
}

/** A warning-level message with ids only (never emails or names). */
export function captureMessage(message: string, extra?: Record<string, string | number>): void {
  if (!initialized) {
    // Still visible in the server log (ids only).
    console.warn(JSON.stringify({ level: "warn", msg: message, ...(extra ?? {}) }));
    return;
  }
  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    for (const [k, v] of Object.entries(extra ?? {})) scope.setExtra(k, v);
    Sentry.captureMessage(message);
  });
}

export async function closeSentry(): Promise<void> {
  if (initialized) {
    await Sentry.close(2000);
  }
}

export function isSentryEnabled(): boolean {
  return initialized;
}
