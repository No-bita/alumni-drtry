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

function contactReminderIntervalMs(): number {
  const raw = env.CONTACT_REQUEST_REMINDER_SCHEDULER_MS;
  if (raw !== undefined) return raw;
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

  // Reminder emails for notes pending 3–14 days (one per note; claims are atomic across replicas).
  const reminderMs = contactReminderIntervalMs();
  let reminderInterval: ReturnType<typeof setInterval> | undefined;
  let reminderStartupTimer: ReturnType<typeof setTimeout> | undefined;
  if (reminderMs > 0) {
    const remind = () => {
      void app.contactRequestService
        .sendDueReminders()
        .then(({ sent, failed }) => {
          app.log.info({ sent, failed }, "contact request reminder tick");
        })
        .catch((err: unknown) => {
          app.log.error({ err }, "contact request reminder tick failed");
        });
      // Same hourly tick: drop usage events past their 12-month retention.
      void app.adminMetricsService
        .purgeOldUsageEvents()
        .then((purged) => {
          if (purged > 0) app.log.info({ purged }, "usage events purged");
        })
        .catch((err: unknown) => {
          app.log.error({ err }, "usage event purge failed");
        });
      // And forget used WhatsApp link tokens once they've expired anyway.
      void app.whatsappService.purgeUsedLinks().catch((err: unknown) => {
        app.log.error({ err }, "whatsapp used-link purge failed");
      });
    };
    reminderStartupTimer = setTimeout(remind, 60_000);
    reminderInterval = setInterval(remind, reminderMs);
  }

  const shutdown = async () => {
    stopExpiryScheduler();
    if (reminderInterval !== undefined) clearInterval(reminderInterval);
    if (reminderStartupTimer !== undefined) clearTimeout(reminderStartupTimer);
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

