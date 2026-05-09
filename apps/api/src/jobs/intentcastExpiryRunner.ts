import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { ConsoleEmailSender } from "../services/emailSender.js";
import { IntentcastService } from "../services/intentcastService.js";

/** Shared by the CLI job and the optional in-process production scheduler. */
export async function runIntentcastExpiryJob(): Promise<{ expired: number; purged: number }> {
  const service = new IntentcastService(
    pool,
    new ConsoleEmailSender(),
    env.INTENTCAST_AUTHOR_DELETE_RETENTION_DAYS
  );
  const expired = await service.expireIntentcasts(5000);
  const purged = await service.purgeSoftDeletedIntentcasts(5000);
  return { expired, purged };
}
