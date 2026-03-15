import "dotenv/config";
import { env } from "./config/env.js";
import { initSentry, closeSentry } from "./lib/sentry.js";
import { createApp } from "./app.js";

initSentry();

async function main() {
  const app = await createApp();
  await app.listen({
    host: "0.0.0.0",
    port: env.PORT
  });

  const shutdown = async () => {
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

