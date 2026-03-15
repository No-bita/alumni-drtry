import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      const alreadyApplied = await client.query<{ version: string }>(
        `SELECT version FROM schema_migrations WHERE version = $1`,
        [version]
      );
      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [version]);
      process.stdout.write(`Applied migration: ${version}\n`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  process.stderr.write(`Migration failed: ${String(error)}\n`);
  process.exitCode = 1;
});

