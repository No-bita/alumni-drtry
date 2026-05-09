/**
 * Removes a non-admin profile and all related rows (sessions, profile data,
 * threads, intentcasts, discovery analytics, etc.). Mirrors a clean slate like
 * removing a beta alumni account from the platform (minus shared reference data).
 *
 * Does not delete super_admin/admin accounts unless --force is passed.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/delete-person-full-by-email.ts user@itbhu.ac.in
 *   npx tsx scripts/delete-person-full-by-email.ts user@itbhu.ac.in --force
 */
import "dotenv/config";
import pg from "pg";
import { normalizeEmail } from "../src/lib/domainAllowlist.js";

const args = process.argv.slice(2).filter((a) => a !== "--force");
const forceAdmin = process.argv.includes("--force");
const emailRaw = args[0]?.trim();
if (!emailRaw) {
  console.error(
    "Usage: npx tsx scripts/delete-person-full-by-email.ts <institutional_email> [--force]"
  );
  process.exit(1);
}

const normalizedEmail = normalizeEmail(emailRaw);

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
    const { rows } = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM people WHERE lower(institutional_email::text) = lower($1)`,
      [normalizedEmail]
    );
    const row = rows[0];
    if (!row) {
      console.error(`No people row found for ${normalizedEmail}`);
      await client.query("ROLLBACK");
      process.exit(1);
    }

    if ((row.role === "admin" || row.role === "super_admin") && !forceAdmin) {
      console.error(
        `Refusing to delete ${normalizedEmail}: role is ${row.role}. Pass --force to override.`
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }

    const personId = row.id;

    const betaUsage = await client.query(`DELETE FROM beta_usage_events WHERE person_id = $1`, [
      personId,
    ]);
    const betaAuth = await client.query(`DELETE FROM beta_auth_events WHERE person_id = $1`, [
      personId,
    ]);
    const clicks = await client.query(
      `DELETE FROM discovery_profile_click_events WHERE viewer_person_id = $1 OR profile_id = $1`,
      [personId]
    );
    const discoverySessions = await client.query(
      `DELETE FROM discovery_search_sessions WHERE viewer_person_id = $1`,
      [personId]
    );

    const challenges = await client.query(
      `DELETE FROM auth_challenges WHERE lower(institutional_email::text) = lower($1)`,
      [normalizedEmail]
    );

    const campusIssues = await client.query(`DELETE FROM campus_monthly_issues WHERE uploaded_by = $1`, [
      personId,
    ]);

    const betaAllow = await client.query(
      `DELETE FROM beta_allowed_emails WHERE email_normalized = $1`,
      [normalizedEmail]
    );
    const adminAllow = await client.query(
      `DELETE FROM admin_allowed_emails WHERE email_normalized = $1`,
      [normalizedEmail]
    );

    const deletedPerson = await client.query(`DELETE FROM people WHERE id = $1 RETURNING id`, [
      personId,
    ]);

    await client.query("COMMIT");

    console.log(`Fully deleted person ${normalizedEmail} (${personId}).`);
    console.log(`  beta_usage_events: ${betaUsage.rowCount ?? 0}`);
    console.log(`  beta_auth_events: ${betaAuth.rowCount ?? 0}`);
    console.log(`  discovery_profile_click_events: ${clicks.rowCount ?? 0}`);
    console.log(`  discovery_search_sessions: ${discoverySessions.rowCount ?? 0}`);
    console.log(`  auth_challenges: ${challenges.rowCount ?? 0}`);
    console.log(`  campus_monthly_issues (uploaded_by): ${campusIssues.rowCount ?? 0}`);
    console.log(`  beta_allowed_emails: ${betaAllow.rowCount ?? 0}`);
    console.log(`  admin_allowed_emails: ${adminAllow.rowCount ?? 0}`);
    console.log(`  people: ${deletedPerson.rowCount ?? 0}`);
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
