/**
 * Insert demo alumni that share a batch year + department so "Your Batch" on /home shows rows.
 *
 * Prereq: DATABASE_URL (e.g. apps/api/.env). Uses @iitbhu.ac.in addresses; rows are flagged
 * is_test_user for cleanup (see scripts/delete-test-users.sql — that deletes ALL is_test_user).
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-batch-demo-profiles.ts
 *   npx tsx scripts/seed-batch-demo-profiles.ts --dept mst --year 2024 --count 6
 *
 * Match your own profile: set --dept and --year to the same values as your account
 * (profile batch year + department code, e.g. mst / 2024).
 */
import "dotenv/config";
import pg from "pg";

const DEMO_NAMES = [
  "Arjun Mehta",
  "Kavya Reddy",
  "Rohit Joshi",
  "Sneha Iyer",
  "Vikram Nair",
  "Ananya Das",
  "Devika Rao",
  "Karan Bhatt",
];

const DEMO_HEADLINES: { role: string; org: string }[] = [
  { role: "Materials Engineer", org: "Bharat Forge" },
  { role: "Graduate Researcher", org: "IIT Bombay" },
  { role: "Product Analyst", org: "Tata Steel" },
  { role: "Process Engineer", org: "Reliance Industries" },
  { role: "R&D Associate", org: "Hindalco" },
  { role: "Consultant", org: "Deloitte" },
  { role: "Founding Engineer", org: "Series A startup" },
  { role: "MS candidate", org: "Georgia Tech" },
];

/** Matches DEMO_HEADLINES length — used for residence filters + FTS on directory search. */
const DEMO_LOCATIONS: { city: string; country: string }[] = [
  { city: "Pune", country: "India" },
  { city: "Mumbai", country: "India" },
  { city: "Jamshedpur", country: "India" },
  { city: "Jamnagar", country: "India" },
  { city: "Bengaluru", country: "India" },
  { city: "Gurugram", country: "India" },
  { city: "Bengaluru", country: "India" },
  { city: "Atlanta", country: "United States" },
];

const DEMO_SKILLS: string[] = [
  "Materials characterization, quality systems, supplier audits",
  "Thin films, microscopy, academic publishing",
  "Operations analytics, spreadsheets, stakeholder reporting",
  "Process safety, plant trials, documentation",
  "Failure analysis, metallography, lab instrumentation",
  "Client delivery, slide decks, stakeholder workshops",
  "Early-stage systems, hiring loops, technical roadmap",
  "Graduate coursework, research proposals, scientific writing",
];

function demoBio(role: string, org: string): string {
  return (
    `[DEMO] ${role} focused profile anchored at ${org}. Seeded batch cohort demo for directory search — ` +
    `materials-adjacent background, realistic headline org linkage, and residence fields for geographic filters.`
  );
}

function parseArgs(): { dept: string; year: number; count: number } {
  const argv = process.argv.slice(2);
  let dept = "mst";
  let year = 2024;
  let count = 6;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dept" && argv[i + 1]) {
      dept = argv[++i]!.toLowerCase().trim();
    } else if (a === "--year" && argv[i + 1]) {
      year = parseInt(argv[++i]!, 10);
    } else if (a === "--count" && argv[i + 1]) {
      count = parseInt(argv[++i]!, 10);
    }
  }
  if (!Number.isFinite(year) || year < 1960 || year > new Date().getFullYear() + 1) {
    throw new Error(`Invalid --year ${year}`);
  }
  if (!Number.isFinite(count) || count < 1 || count > 20) {
    throw new Error(`Invalid --count (use 1–20)`);
  }
  return { dept, year, count };
}

async function main() {
  const { dept, year, count } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const deptRow = await client.query<{ id: string }>(
      `SELECT id FROM departments WHERE lower(code) = lower($1) AND is_active IS NOT FALSE LIMIT 1`,
      [dept]
    );
    if (deptRow.rows.length === 0) {
      throw new Error(`No department row for code "${dept}". Check departments table / migrations.`);
    }
    const departmentId = deptRow.rows[0]!.id;

    const occType = await client.query<{ id: string }>(
      `SELECT id FROM occupation_types WHERE code = 'full_time_employment' LIMIT 1`
    );
    if (occType.rows.length === 0) {
      throw new Error("occupation_types missing full_time_employment");
    }
    const occupationTypeId = occType.rows[0]!.id;

    const degreeRow = await client.query<{ id: string }>(
      `SELECT id FROM degrees WHERE lower(code) = lower('btech') AND is_active IS NOT FALSE LIMIT 1`
    );
    const degreeId = degreeRow.rows[0]?.id ?? null;

    const del = await client.query(
      `
      DELETE FROM people
      WHERE is_test_user = TRUE
        AND lower(institutional_email::text) LIKE 'batchdemo.%@iitbhu.ac.in'
      `
    );
    if ((del.rowCount ?? 0) > 0) {
      console.log(`Removed ${del.rowCount} previous batch-demo rows.`);
    }

    const orgNames = Array.from(
      new Set(
        Array.from({ length: count }, (_, i) => DEMO_HEADLINES[i % DEMO_HEADLINES.length]!.org.trim())
      )
    );
    for (const orgName of orgNames) {
      await client.query(
        `
        INSERT INTO organizations (name, approval_status, created_by_person_id)
        VALUES ($1, 'approved', NULL::uuid)
        ON CONFLICT (name)
        DO UPDATE SET approval_status = 'approved', updated_at = now()
        `,
        [orgName]
      );
    }

    const organizationRows = await client.query<{ id: string; name: string }>(
      `SELECT id, name::text AS name FROM organizations WHERE name = ANY($1::citext[])`,
      [orgNames]
    );
    const orgIdByName = new Map(organizationRows.rows.map((r) => [r.name.toLowerCase(), r.id]));

    const inserted: string[] = [];
    for (let i = 0; i < count; i++) {
      const local = `batchdemo.${dept}${year}.${String(i + 1).padStart(2, "0")}`;
      const email = `${local}@iitbhu.ac.in`;
      const fullName = DEMO_NAMES[i % DEMO_NAMES.length]!;
      const hl = DEMO_HEADLINES[i % DEMO_HEADLINES.length]!;
      const loc = DEMO_LOCATIONS[i % DEMO_LOCATIONS.length]!;
      const skills = DEMO_SKILLS[i % DEMO_SKILLS.length]!;
      const orgId = orgIdByName.get(hl.org.toLowerCase());
      if (!orgId) {
        throw new Error(`Missing organization id for "${hl.org}" after upsert.`);
      }

      const ins = await client.query<{ id: string }>(
        `
        INSERT INTO people (
          institutional_email,
          role,
          full_name,
          department_id,
          degree_id,
          batch_year,
          bio,
          skills_text,
          residence_city,
          residence_country,
          is_test_user,
          profile_completed_at,
          onboarding_completed_at,
          updated_at
        )
        VALUES ($1, 'alumni', $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, TRUE, now(), now(), now())
        RETURNING id
        `,
        [
          email,
          fullName,
          departmentId,
          degreeId,
          year,
          demoBio(hl.role, hl.org),
          skills,
          loc.city,
          loc.country,
        ]
      );
      const personId = ins.rows[0]!.id;

      await client.query(
        `
        INSERT INTO occupations (
          person_id,
          occupation_type_id,
          organization_id,
          role_title,
          description,
          is_current,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, TRUE, now(), now())
        `,
        [
          personId,
          occupationTypeId,
          orgId,
          hl.role,
          "[DEMO] Seeded occupation for batch-demo directory listings (linked employer for search filters).",
        ]
      );

      await client.query(
        `
        INSERT INTO profile_links (person_id, platform, url, label, created_at, updated_at)
        VALUES ($1::uuid, 'linkedin', $2, 'LinkedIn', now(), now())
        `,
        [personId, `https://www.linkedin.com/in/${local.replace(/\./g, "-")}/`]
      );
      inserted.push(email);
    }

    await client.query("COMMIT");
    console.log(
      `Inserted ${inserted.length} demo profile(s) for dept=${dept} batch_year=${year}. Emails:\n  ${inserted.join("\n  ")}`
    );
    console.log("Reload /home — Your Batch should list them (same cohort as your profile).");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
