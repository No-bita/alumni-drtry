import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

let initialized = false;

export function initSentry(): void {
  if (env.NODE_ENV === "test" || !env.SENTRY_DSN?.trim()) {
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1
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
    if (context?.url) scope.setExtra("url", context.url);
    Sentry.captureException(error);
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
