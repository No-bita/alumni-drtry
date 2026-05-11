/**
 * Deletes every `people` row whose institutional email local-part matches API e2e tests
 * (`e2e...`, same rule as `apps/api/src/lib/testUser.ts` / migration 012).
 *
 * Handles `campus_monthly_issues.uploaded_by` (ON DELETE RESTRICT) and orphan cleanup on
 * analytics tables that use ON DELETE SET NULL.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/delete-all-e2e-test-alumni.ts
 *   npx tsx scripts/delete-all-e2e-test-alumni.ts --dry-run
 *   npx tsx scripts/delete-all-e2e-test-alumni.ts --force   # allow admin/super_admin matches
 */
import "dotenv/config";
import pg from "pg";
import { emailFingerprintForLog } from "../src/lib/sensitiveEmailLog.js";

const dryRun = process.argv.includes("--dry-run");
const forceAdmin = process.argv.includes("--force");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** Matches migration `012_people_is_test_user.sql` and `isTestInstitutionalEmail`. */
const E2E_PEOPLE_PREDICATE = `lower(split_part(institutional_email::text, '@', 1)) LIKE 'e2e%'`;

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: targets } = await client.query<{ id: string; email: string; role: string }>(
      `
      SELECT id, institutional_email::text AS email, role
      FROM people
      WHERE ${E2E_PEOPLE_PREDICATE}
      ORDER BY email
      `
    );

    if (targets.length === 0) {
      await client.query("COMMIT");
      console.log("No e2e-pattern alumni found.");
      return;
    }

    const elevated = targets.filter((t) => t.role === "admin" || t.role === "super_admin");
    if (elevated.length > 0 && !forceAdmin) {
      await client.query("ROLLBACK");
      console.error(
        `Refusing to delete ${elevated.length} row(s) with admin role (unexpected for e2e). Matches:\n` +
          elevated
            .map((t) => `  ${emailFingerprintForLog(t.email)} (${t.role})`)
            .join("\n") +
          "\nPass --force if you really mean it."
      );
      process.exit(1);
    }

    console.log(`${dryRun ? "[dry-run] Would delete" : "Deleting"} ${targets.length} e2e alumni:`);
    for (const t of targets) {
      console.log(`  ${emailFingerprintForLog(t.email)} (${t.role})`);
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log("[dry-run] Rolled back; no changes applied.");
      return;
    }

    const ids = targets.map((t) => t.id);

    const campus = await client.query(`DELETE FROM campus_monthly_issues WHERE uploaded_by = ANY($1::uuid[])`, [
      ids,
    ]);
    const betaUsage = await client.query(`DELETE FROM beta_usage_events WHERE person_id = ANY($1::uuid[])`, [
      ids,
    ]);
    const betaAuth = await client.query(`DELETE FROM beta_auth_events WHERE person_id = ANY($1::uuid[])`, [ids]);
    const challenges = await client.query(
      `DELETE FROM auth_challenges WHERE lower(split_part(institutional_email::text, '@', 1)) LIKE 'e2e%'`
    );
    const betaAllow = await client.query(
      `DELETE FROM beta_allowed_emails WHERE lower(split_part(email_normalized::text, '@', 1)) LIKE 'e2e%'`
    );
    const adminAllow = await client.query(
      `DELETE FROM admin_allowed_emails WHERE lower(split_part(email_normalized::text, '@', 1)) LIKE 'e2e%'`
    );

    const deletedPeople = await client.query<{ id: string; email: string }>(
      `DELETE FROM people WHERE id = ANY($1::uuid[]) RETURNING id, institutional_email::text AS email`,
      [ids]
    );

    await client.query("COMMIT");

    console.log("Done.");
    console.log(`  campus_monthly_issues: ${campus.rowCount ?? 0}`);
    console.log(`  beta_usage_events: ${betaUsage.rowCount ?? 0}`);
    console.log(`  beta_auth_events: ${betaAuth.rowCount ?? 0}`);
    console.log(`  auth_challenges (e2e local-part): ${challenges.rowCount ?? 0}`);
    console.log(`  beta_allowed_emails (e2e local-part): ${betaAllow.rowCount ?? 0}`);
    console.log(`  admin_allowed_emails (e2e local-part): ${adminAllow.rowCount ?? 0}`);
    console.log(`  people: ${deletedPeople.rowCount ?? 0}`);
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
