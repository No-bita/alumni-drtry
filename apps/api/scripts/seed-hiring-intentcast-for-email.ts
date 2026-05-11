/**
 * Insert a new open hiring bulletin post for an existing person (by institutional email).
 *
 * Usage (from apps/api, with .env DATABASE_URL):
 *   npx tsx scripts/seed-hiring-intentcast-for-email.ts you@itbhu.ac.in
 *
 * Optional second arg: custom post body (otherwise a default structured hiring blurb).
 */
import "dotenv/config";
import pg from "pg";
import { emailFingerprintForLog } from "../src/lib/sensitiveEmailLog.js";

const DEFAULT_CONTENT =
  "ACME Labs — Backend Engineer, Distributed Systems (Bangalore, hybrid). Full-time; 3+ years with Go or Rust. Alumni referrals welcome — reply here to connect.";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/seed-hiring-intentcast-for-email.ts <institutional_email>");
    process.exit(1);
  }
  const emailLogId = emailFingerprintForLog(email);
  const content = (process.argv[3]?.trim() || DEFAULT_CONTENT).trim();
  if (content.length < 10) {
    console.error("Content must be at least 10 characters.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    const r = await pool.query<{ id: string }>(
      `
      INSERT INTO intentcasts (
        author_person_id,
        content,
        category,
        status,
        expires_at,
        editable_until,
        closed_at,
        closed_reason,
        closed_by_person_id,
        created_at,
        updated_at
      )
      SELECT
        p.id,
        $2,
        'hiring',
        'open',
        now() + interval '90 days',
        now() - interval '1 day',
        NULL,
        NULL,
        NULL,
        now(),
        now()
      FROM people p
      WHERE lower(p.institutional_email::text) = lower($1)
        AND p.deleted_at IS NULL
      RETURNING id
      `,
      [email, content]
    );

    if (r.rowCount === 0) {
      console.error(`No active person row for ${emailLogId}.`);
      process.exit(1);
    }

    console.log("Created intentcast", r.rows[0]?.id);
    console.log("Open /career (Opportunities) or home bulletin (Hiring) while signed in.");
  } finally {
    await pool.end();
  }
}

void main();
