/**
 * Removes every bulletin/careers intentcast whose author is a demo/test alumni — same rule as
 * {@link personIsDemoSql} / UI `authorIsDemo` (`is_test_user`, `batchdemo.*`, `platformdemo.*` emails).
 * Responses cascade (`intentcast_responses` ON DELETE CASCADE).
 *
 * From apps/api (DATABASE_URL required):
 *   npx tsx scripts/delete-all-demo-intentcasts.ts
 *   npx tsx scripts/delete-all-demo-intentcasts.ts --dry-run
 */
import "dotenv/config";
import pg from "pg";
import { personIsDemoSql } from "../src/lib/demoPersonSql.js";

const dryRun = process.argv.includes("--dry-run");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main(): Promise<void> {
  const demoPred = personIsDemoSql("p");
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const { rows: sample } = await client.query<{ id: string; category: string; created_at: Date }>(
      `
      SELECT i.id, i.category::text, i.created_at
      FROM intentcasts i
      INNER JOIN people p ON p.id = i.author_person_id
      WHERE (${demoPred})
      ORDER BY i.created_at DESC
      LIMIT 30
      `
    );
    const { rows: countRow } = await client.query<{ n: string }>(
      `
      SELECT count(*)::text AS n
      FROM intentcasts i
      INNER JOIN people p ON p.id = i.author_person_id
      WHERE (${demoPred})
      `
    );
    const total = parseInt(countRow[0]?.n ?? "0", 10);

    console.log(`Demo-authored intentcasts: ${total}`);
    if (sample.length > 0) {
      console.log(sample.length < total ? `Sample (newest ${sample.length}):` : "Rows:");
      for (const r of sample) {
        console.log(`  ${r.id}  ${r.category}  ${r.created_at.toISOString()}`);
      }
    }

    if (total === 0) {
      console.log("Nothing to delete.");
      return;
    }

    if (dryRun) {
      console.log("[dry-run] No changes applied.");
      return;
    }

    const del = await client.query(
      `
      DELETE FROM intentcasts i
      USING people p
      WHERE i.author_person_id = p.id
        AND (${demoPred})
      `
    );
    console.log(`Deleted ${del.rowCount ?? 0} intentcast row(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
