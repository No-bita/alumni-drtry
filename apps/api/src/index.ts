import "dotenv/config";
import { env } from "./config/env.js";
import { initSentry, closeSentry } from "./lib/sentry.js";
import { createApp } from "./app.js";
import { runIntentcastExpiryJob } from "./jobs/intentcastExpiryRunner.js";

initSentry();

function intentcastExpiryIntervalMs(): number {
  const raw = env.INTENTCAST_EXPIRY_SCHEDULER_MS;
  if (raw !== undefined) {
    return raw;
  }
  return env.NODE_ENV === "production" ? 60 * 60 * 1000 : 0;
}

async function main() {
  const app = await createApp();
  await app.listen({
    host: "0.0.0.0",
    port: env.PORT
  });

  const intervalMs = intentcastExpiryIntervalMs();
  let expiryInterval: ReturnType<typeof setInterval> | undefined;
  let expiryStartupTimer: ReturnType<typeof setTimeout> | undefined;
  const stopExpiryScheduler = () => {
    if (expiryInterval !== undefined) {
      clearInterval(expiryInterval);
      expiryInterval = undefined;
    }
    if (expiryStartupTimer !== undefined) {
      clearTimeout(expiryStartupTimer);
      expiryStartupTimer = undefined;
    }
  };

  if (intervalMs > 0) {
    const tick = () => {
      void runIntentcastExpiryJob()
        .then(({ expired, purged }) => {
          app.log.info({ expired, purged }, "intentcast expiry tick");
        })
        .catch((err: unknown) => {
          app.log.error({ err }, "intentcast expiry tick failed");
        });
    };
    expiryStartupTimer = setTimeout(tick, 30_000);
    expiryInterval = setInterval(tick, intervalMs);
  }

  const shutdown = async () => {
    stopExpiryScheduler();
    await app.close();
    await closeSentry();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  process.stderr.write(`Failed to start API: ${String(error)}\n`);
  process.exit(1);
});

