/**
 * Deletes analytics rows for a person by institutional email.
 * Does not delete the account, sessions, or profile — only telemetry tables.
 *
 * Usage (from apps/api): npx tsx scripts/clear-person-analytics-by-email.ts user@itbhu.ac.in
 */
import "dotenv/config";
import pg from "pg";
import { emailFingerprintForLog } from "../src/lib/sensitiveEmailLog.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx scripts/clear-person-analytics-by-email.ts <institutional_email>");
  process.exit(1);
}

const emailLogId = emailFingerprintForLog(email);

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM people WHERE lower(institutional_email::text) = lower($1)`,
      [email]
    );
    const personId = rows[0]?.id;
    if (!personId) {
      console.error(`No people row found for ${email}`);
      await client.query("ROLLBACK");
      process.exit(1);
    }

    const r1 = await client.query(`DELETE FROM beta_usage_events WHERE person_id = $1`, [personId]);
    const r2 = await client.query(`DELETE FROM beta_auth_events WHERE person_id = $1`, [personId]);
    const r3 = await client.query(
      `DELETE FROM discovery_profile_click_events WHERE viewer_person_id = $1 OR profile_id = $1`,
      [personId]
    );
    const r4 = await client.query(`DELETE FROM discovery_search_sessions WHERE viewer_person_id = $1`, [personId]);

    await client.query("COMMIT");
    console.log(`Cleared analytics for ${emailLogId} (${personId}):`);
    console.log(`  beta_usage_events: ${r1.rowCount ?? 0}`);
    console.log(`  beta_auth_events: ${r2.rowCount ?? 0}`);
    console.log(`  discovery_profile_click_events: ${r3.rowCount ?? 0}`);
    console.log(`  discovery_search_sessions: ${r4.rowCount ?? 0}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
