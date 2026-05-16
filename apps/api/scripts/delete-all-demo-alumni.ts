/**
 * Deletes every demo/test alumni profile — same rule as {@link personIsDemoSql} plus legacy
 * `demo.alumni.*` emails (migration 026). Also clears related auth/analytics rows like
 * {@link delete-all-e2e-test-alumni.ts}.
 *
 * From apps/api (DATABASE_URL required — use production pooler URL for live):
 *   npx tsx scripts/delete-all-demo-alumni.ts --dry-run
 *   npx tsx scripts/delete-all-demo-alumni.ts
 *   npx tsx scripts/delete-all-demo-alumni.ts --force   # allow admin/super_admin matches
 */
import "dotenv/config";
import pg from "pg";
import { personIsDemoAlumniSql } from "../src/lib/demoPersonSql.js";
import { emailFingerprintForLog } from "../src/lib/sensitiveEmailLog.js";

const dryRun = process.argv.includes("--dry-run");
const forceAdmin = process.argv.includes("--force");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

function demoPeoplePredicate(tableAlias: string): string {
  return personIsDemoAlumniSql(tableAlias);
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  const pred = demoPeoplePredicate("people");
  try {
    await client.query("BEGIN");

    const { rows: targets } = await client.query<{ id: string; email: string; role: string }>(
      `
      SELECT id, institutional_email::text AS email, role
      FROM people
      WHERE ${pred}
      ORDER BY email
      `
    );

    if (targets.length === 0) {
      await client.query("COMMIT");
      console.log("No demo alumni found.");
      return;
    }

    const elevated = targets.filter((t) => t.role === "admin" || t.role === "super_admin");
    if (elevated.length > 0 && !forceAdmin) {
      await client.query("ROLLBACK");
      console.error(
        `Refusing to delete ${elevated.length} row(s) with admin role. Matches:\n` +
          elevated.map((t) => `  ${emailFingerprintForLog(t.email)} (${t.role})`).join("\n") +
          "\nPass --force if you really mean it."
      );
      process.exit(1);
    }

    console.log(`${dryRun ? "[dry-run] Would delete" : "Deleting"} ${targets.length} demo alumni:`);
    for (const t of targets) {
      console.log(`  ${emailFingerprintForLog(t.email)} (${t.role})`);
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log("[dry-run] Rolled back; no changes applied.");
      return;
    }

    const ids = targets.map((t) => t.id);
    const emails = targets.map((t) => t.email.toLowerCase());

    const campus = await client.query(`DELETE FROM campus_monthly_issues WHERE uploaded_by = ANY($1::uuid[])`, [
      ids,
    ]);
    const betaUsage = await client.query(`DELETE FROM beta_usage_events WHERE person_id = ANY($1::uuid[])`, [ids]);
    const betaAuth = await client.query(`DELETE FROM beta_auth_events WHERE person_id = ANY($1::uuid[])`, [ids]);

    const challenges = await client.query(
      `
      DELETE FROM auth_challenges
      WHERE lower(institutional_email::text) = ANY($1::text[])
      `,
      [emails]
    );
    const betaAllow = await client.query(
      `
      DELETE FROM beta_allowed_emails
      WHERE lower(email_normalized::text) = ANY($1::text[])
      `,
      [emails]
    );
    const adminAllow = await client.query(
      `
      DELETE FROM admin_allowed_emails
      WHERE lower(email_normalized::text) = ANY($1::text[])
      `,
      [emails]
    );

    const intentcasts = await client.query(
      `
      DELETE FROM intentcasts i
      USING people p
      WHERE i.author_person_id = p.id
        AND (${demoPeoplePredicate("p")})
      `
    );

    const deletedPeople = await client.query(
      `DELETE FROM people WHERE id = ANY($1::uuid[]) RETURNING id`,
      [ids]
    );

    await client.query("COMMIT");

    console.log("Done.");
    console.log(`  intentcasts (demo authors): ${intentcasts.rowCount ?? 0}`);
    console.log(`  campus_monthly_issues: ${campus.rowCount ?? 0}`);
    console.log(`  beta_usage_events: ${betaUsage.rowCount ?? 0}`);
    console.log(`  beta_auth_events: ${betaAuth.rowCount ?? 0}`);
    console.log(`  auth_challenges: ${challenges.rowCount ?? 0}`);
    console.log(`  beta_allowed_emails: ${betaAllow.rowCount ?? 0}`);
    console.log(`  admin_allowed_emails: ${adminAllow.rowCount ?? 0}`);
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
