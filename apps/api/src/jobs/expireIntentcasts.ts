import "dotenv/config";
import { pool } from "../db/pool.js";
import { IntentcastService } from "../services/intentcastService.js";

async function main() {
  const service = new IntentcastService(pool);
  const expiredCount = await service.expireIntentcasts(5000);
  process.stdout.write(`Expired intentcasts: ${expiredCount}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Intentcast expiry job failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

