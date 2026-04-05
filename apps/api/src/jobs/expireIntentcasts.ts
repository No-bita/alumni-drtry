import "dotenv/config";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { ConsoleEmailSender } from "../services/emailSender.js";
import { IntentcastService } from "../services/intentcastService.js";

async function main() {
  const service = new IntentcastService(pool, new ConsoleEmailSender(), env.INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS);
  const expiredCount = await service.expireIntentcasts(5000);
  const purgedCount = await service.purgeSoftDeletedIntentcasts(5000);
  process.stdout.write(`Expired intentcasts: ${expiredCount}\n`);
  process.stdout.write(`Purged author-deleted intentcasts: ${purgedCount}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Intentcast expiry job failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

