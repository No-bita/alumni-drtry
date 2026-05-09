import "dotenv/config";
import { pool } from "../db/pool.js";
import { runIntentcastExpiryJob } from "./intentcastExpiryRunner.js";

async function main() {
  const { expired, purged } = await runIntentcastExpiryJob();
  process.stdout.write(`Expired intentcasts: ${expired}\n`);
  process.stdout.write(`Purged author-deleted intentcasts: ${purged}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Intentcast expiry job failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

