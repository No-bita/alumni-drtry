/**
 * Owner-run, idempotent seed + cleanup for the shared demo login / guided tour (see
 * docs/demo-login-guided-tour.md).
 *
 * Creates a small, clearly labeled synthetic dataset:
 *   - 1 demo viewer account (the DEMO_AUTH_EMAIL identity), role 'alumni', onboarding complete
 *   - 10 synthetic alumni (6 in Bengaluru) with a current occupation and a profile link
 *   - 5 open intentcasts ("[DEMO] ...") authored by synthetic alumni, for the Bengaluru city board
 *
 * Every row is identified by an explicit email list (demo.alumni.tour.NN@iitbhu.ac.in plus the
 * viewer email), is_test_user = TRUE, and has a "[DEMO]" bio. Cleanup deletes exactly that list.
 * It never uses the broad delete-all-demo-alumni predicate, so other test users are untouched.
 *
 * Safety: refuses to overwrite or delete any existing row with one of these emails unless it is
 * is_test_user = TRUE and role = 'alumni'. Never touches allowlists, admin rows, or real alumni.
 *
 * From apps/api (DATABASE_URL = the target database, e.g. the Supabase pooler URL):
 *   DEMO_AUTH_EMAIL=demo.alumni.guest@iitbhu.ac.in npx tsx scripts/seed-demo-tour-fixtures.ts --dry-run
 *   DEMO_AUTH_EMAIL=demo.alumni.guest@iitbhu.ac.in npx tsx scripts/seed-demo-tour-fixtures.ts
 *   DEMO_AUTH_EMAIL=demo.alumni.guest@iitbhu.ac.in npx tsx scripts/seed-demo-tour-fixtures.ts --cleanup
 * (--viewer-email <email> works instead of DEMO_AUTH_EMAIL.) Add --cleanup --dry-run to preview removal.
 */
import "dotenv/config";
import pg from "pg";

export type Fixture = {
  name: string;
  deptCode: string;
  degreeCode: string;
  batchYear: number;
  roleTitle: string;
  organization: string;
  city: string;
  country: string;
  skills: string;
};

export const FIXTURES: Fixture[] = [
  { name: "Rahul Sharma", deptCode: "cse", degreeCode: "btech", batchYear: 2021, roleTitle: "Backend Engineer", organization: "Razorpay", city: "Bengaluru", country: "India", skills: "Go, Distributed Systems, PostgreSQL" },
  { name: "Sneha Gupta", deptCode: "cse", degreeCode: "btech", batchYear: 2020, roleTitle: "Senior Software Engineer", organization: "Razorpay", city: "Bengaluru", country: "India", skills: "Java, APIs, Kubernetes" },
  { name: "Arjun Singh", deptCode: "cse", degreeCode: "btech", batchYear: 2022, roleTitle: "Backend Developer", organization: "Swiggy", city: "Bengaluru", country: "India", skills: "Node.js, TypeScript, Redis" },
  { name: "Vivek Tiwari", deptCode: "ece", degreeCode: "btech", batchYear: 2021, roleTitle: "Software Engineer", organization: "Flipkart", city: "Bengaluru", country: "India", skills: "Python, APIs, Scalability" },
  { name: "Karthik Menon", deptCode: "mech", degreeCode: "btech", batchYear: 2018, roleTitle: "Engineering Manager", organization: "Swiggy", city: "Bengaluru", country: "India", skills: "Leadership, Backend Systems, Hiring" },
  { name: "Meera Iyer", deptCode: "eee", degreeCode: "mtech", batchYear: 2017, roleTitle: "Staff Engineer", organization: "Atlassian", city: "Bengaluru", country: "India", skills: "System Design, Mentoring, Reliability" },
  { name: "Ananya Das", deptCode: "cse", degreeCode: "mtech", batchYear: 2019, roleTitle: "Product Engineer", organization: "Google", city: "Hyderabad", country: "India", skills: "React, Product Thinking, SQL" },
  { name: "Riya Nair", deptCode: "ece", degreeCode: "btech", batchYear: 2023, roleTitle: "Data Engineer", organization: "Microsoft", city: "Pune", country: "India", skills: "Data Pipelines, Spark, SQL" },
  { name: "Devika Rao", deptCode: "cse", degreeCode: "btech", batchYear: 2016, roleTitle: "Principal Engineer", organization: "Atlassian", city: "Sydney", country: "Australia", skills: "Architecture, Mentoring, Platform" },
  { name: "Karan Bhatt", deptCode: "cse", degreeCode: "mtech", batchYear: 2024, roleTitle: "MS Candidate", organization: "Georgia Tech", city: "Atlanta", country: "United States", skills: "Machine Learning, Research, Python" },
];

export const INTENTCASTS: { authorIdx: number; category: "hiring" | "mentorship" | "collaboration" | "guidance"; content: string }[] = [
  { authorIdx: 0, category: "hiring", content: "[DEMO] Hiring backend and platform engineers in Bengaluru. Referrals from IIT BHU welcome." },
  { authorIdx: 1, category: "mentorship", content: "[DEMO] Happy to mentor juniors on backend interviews and systems design. 30 minutes a week." },
  { authorIdx: 2, category: "guidance", content: "[DEMO] Moving to Bengaluru next month. Looking for advice on localities near HSR and Indiranagar and commute tips." },
  { authorIdx: 3, category: "collaboration", content: "[DEMO] Looking for collaborators on an alumni referral tracking dashboard. React and Node." },
  { authorIdx: 4, category: "hiring", content: "[DEMO] Our platform team is growing. Open to alumni with 3+ years of backend experience in Bengaluru." },
];

export const EMAIL_DOMAIN = "iitbhu.ac.in";
export const fixtureEmail = (i: number) => `demo.alumni.tour.${String(i + 1).padStart(2, "0")}@${EMAIL_DOMAIN}`;
export const fixtureId = (i: number) => `de300001-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
export const VIEWER_ID = "de300001-0000-4000-8000-000000000999";
export const ALL_DEMO_PERSON_IDS = [VIEWER_ID, ...FIXTURES.map((_, i) => fixtureId(i))];

export type SeedOptions = {
  client: Pick<pg.PoolClient, "query">;
  viewerEmail: string;
  cleanup?: boolean;
  dryRun?: boolean;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
};

export type SeedResult = {
  removed: { people: number; intentcasts: number; organizations: number };
  seeded?: { viewerEmail: string; alumniCount: number; intentcastsCount: number };
};

export async function runDemoTourSeed({
  client,
  viewerEmail,
  cleanup = false,
  dryRun = false,
  logger = console,
}: SeedOptions): Promise<SeedResult> {
  const viewer = viewerEmail.trim().toLowerCase();
  const allEmails = [viewer, ...FIXTURES.map((_, i) => fixtureEmail(i))];
  const orgNames = Array.from(new Set(FIXTURES.map((f) => f.organization)));

  await client.query("BEGIN");
  try {
    const existing = await client.query<{ id: string; email: string; role: string; is_test_user: boolean; is_demo: boolean }>(
      `SELECT id, institutional_email::text AS email, role, COALESCE(is_test_user, FALSE) AS is_test_user, is_demo
       FROM people WHERE lower(institutional_email::text) = ANY($1::text[])`,
      [allEmails]
    );
    const unsafe = existing.rows.filter((r) =>
      r.role !== "alumni" ||
      !r.is_test_user ||
      (r.email.toLowerCase() === viewer ? !r.is_demo : r.is_demo)
    );
    if (unsafe.length > 0) {
      throw new Error(
        `Refusing to proceed: ${unsafe.length} existing row(s) share a demo email but do not match the expected role/is_test_user/is_demo flags. ` +
          "Pick a different DEMO_AUTH_EMAIL or inspect those rows manually."
      );
    }
    const existingIds = existing.rows.map((r) => r.id);

    // Track organizations created by this seed using the dedicated demo_seed_organizations table.
    // Querying demo_seed_organizations does not depend on people rows or created_by_person_id
    // (which would be nullified by ON DELETE SET NULL on people deletion).
    const seedCreatedOrgRows = await client.query<{ id: string }>(
      `SELECT organization_id AS id FROM demo_seed_organizations`
    );
    const seedCreatedOrgIds = seedCreatedOrgRows.rows.map((r) => r.id);

    const removed = { intentcasts: 0, people: 0, organizations: 0 };
    if (existingIds.length > 0) {
      removed.intentcasts = (
        await client.query(`DELETE FROM intentcasts WHERE author_person_id = ANY($1::uuid[])`, [existingIds])
      ).rowCount ?? 0;
      await client.query(`DELETE FROM beta_usage_events WHERE person_id = ANY($1::uuid[])`, [existingIds]);
      await client.query(`DELETE FROM beta_auth_events WHERE person_id = ANY($1::uuid[])`, [existingIds]);
      await client.query(`DELETE FROM discovery_profile_click_events WHERE viewer_person_id = ANY($1::uuid[]) OR profile_id = ANY($1::uuid[])`, [existingIds]);
      await client.query(`DELETE FROM discovery_search_sessions WHERE viewer_person_id = ANY($1::uuid[])`, [existingIds]);
      removed.people = (
        await client.query(`DELETE FROM people WHERE id = ANY($1::uuid[])`, [existingIds])
      ).rowCount ?? 0;
    }

    // Clean up seed-created organizations only if no occupations (or canonical references) still point to them.
    // Deleting an org cascades its tracking row in demo_seed_organizations (ON DELETE CASCADE).
    // An org that is still referenced stays tracked, so a later cleanup can still find it.
    if (seedCreatedOrgIds.length > 0) {
      removed.organizations = (
        await client.query(
          `DELETE FROM organizations
           WHERE id = ANY($1::uuid[])
             AND NOT EXISTS (
               SELECT 1 FROM occupations WHERE occupations.organization_id = organizations.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM organizations o2 WHERE o2.canonical_organization_id = organizations.id
             )`,
          [seedCreatedOrgIds]
        )
      ).rowCount ?? 0;
    }

    logger.log(
      `${cleanup ? "Cleanup" : "Reset"}: removed ${removed.people} demo people, ${removed.intentcasts} intentcasts, ${removed.organizations} demo organizations.`
    );

    if (cleanup) {
      await finish(client, dryRun, "cleanup", logger);
      return { removed };
    }

    const depts = await client.query<{ id: string; code: string }>(`SELECT id, lower(code) AS code FROM departments`);
    const degrees = await client.query<{ id: string; code: string }>(
      `SELECT id, lower(code) AS code FROM degrees WHERE is_active IS NOT FALSE`
    );
    const occ = await client.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment' LIMIT 1`);
    if (!occ.rows[0]) throw new Error("Missing occupation type full_time_employment.");
    const deptId = new Map(depts.rows.map((r) => [r.code, r.id]));
    const degreeId = new Map(degrees.rows.map((r) => [r.code, r.id]));

    const insertPerson = `
      INSERT INTO people (
        id, institutional_email, role, full_name, department_id, degree_id, batch_year, bio, skills_text,
        residence_city, residence_country, is_test_user, is_demo, profile_completed_at, onboarding_completed_at, updated_at
      ) VALUES ($1::uuid, $2, 'alumni', $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, TRUE, $11, now(), now(), now())`;

    // Demo viewer: lands on /home with a complete profile. Role is always 'alumni'.
    // Inserted before organizations so organizations can reference VIEWER_ID as created_by_person_id.
    const cse = deptId.get("cse");
    const btech = degreeId.get("btech");
    if (!cse || !btech) throw new Error("Missing department 'cse' or degree 'btech'.");
    await client.query(insertPerson, [
      VIEWER_ID, viewer, "Demo Guest", cse, btech, 2020,
      "[DEMO] Shared guided-tour account. Read-only.", "Exploring the alumni network",
      "Bengaluru", "India", true,
    ]);

    // Insert fixture organizations without mutating existing rows (no approval_status or updated_at overwrite).
    // Track newly created organizations in demo_seed_organizations for independent provenance.
    for (const name of orgNames) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, approval_status, created_by_person_id)
         VALUES ($1, 'approved', $2::uuid)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [name, VIEWER_ID]
      );
      const newOrgId = inserted.rows[0]?.id;
      if (newOrgId) {
        await client.query(
          `INSERT INTO demo_seed_organizations (organization_id)
           VALUES ($1::uuid)
           ON CONFLICT DO NOTHING`,
          [newOrgId]
        );
      }
    }
    const orgRows = await client.query<{ id: string; name: string }>(
      `SELECT id, name::text AS name FROM organizations WHERE name = ANY($1::citext[])`,
      [orgNames]
    );
    const orgId = new Map(orgRows.rows.map((r) => [r.name.toLowerCase(), r.id]));

    for (let i = 0; i < FIXTURES.length; i++) {
      const f = FIXTURES[i]!;
      const d = deptId.get(f.deptCode);
      const g = degreeId.get(f.degreeCode);
      const o = orgId.get(f.organization.toLowerCase());
      if (!d) throw new Error(`Missing department code "${f.deptCode}".`);
      if (!g) throw new Error(`Missing degree code "${f.degreeCode}".`);
      if (!o) throw new Error(`Missing organization "${f.organization}".`);
      await client.query(insertPerson, [
        fixtureId(i), fixtureEmail(i), f.name, d, g, f.batchYear,
        `[DEMO] Synthetic alumni profile for the guided tour. ${f.roleTitle} at ${f.organization}.`,
        f.skills, f.city, f.country, false,
      ]);
      await client.query(
        `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, description, is_current, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, '[DEMO] Synthetic occupation for the guided tour.', TRUE, now(), now())`,
        [fixtureId(i), occ.rows[0].id, o, f.roleTitle]
      );
      await client.query(
        `INSERT INTO profile_links (person_id, platform, url, label, created_at, updated_at)
         VALUES ($1::uuid, 'linkedin', $2, 'LinkedIn', now(), now())`,
        [fixtureId(i), `https://www.linkedin.com/in/demo-tour-${String(i + 1).padStart(2, "0")}/`]
      );
    }

    for (const c of INTENTCASTS) {
      await client.query(
        `INSERT INTO intentcasts (author_person_id, content, category, status, expires_at, editable_until, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, 'open', now() + interval '60 days', now(), now(), now())`,
        [fixtureId(c.authorIdx), c.content, c.category]
      );
    }

    logger.log(`Seeded viewer (${viewer}), ${FIXTURES.length} alumni (${FIXTURES.filter((f) => f.city === "Bengaluru").length} in Bengaluru), ${INTENTCASTS.length} intentcasts.`);
    await finish(client, dryRun, "seed", logger);
    return {
      removed,
      seeded: {
        viewerEmail: viewer,
        alumniCount: FIXTURES.length,
        intentcastsCount: INTENTCASTS.length,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function finish(
  client: Pick<pg.PoolClient, "query">,
  dry: boolean,
  label: string,
  logger: { log: (...args: any[]) => void }
): Promise<void> {
  if (dry) {
    await client.query("ROLLBACK");
    logger.log(`[dry-run] ${label} rolled back; no changes applied.`);
  } else {
    await client.query("COMMIT");
    logger.log(`Committed ${label}.`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cleanup = argv.includes("--cleanup");
  const dryRun = argv.includes("--dry-run");
  const viewerArgIdx = argv.indexOf("--viewer-email");
  const viewerEmail = (viewerArgIdx >= 0 ? argv[viewerArgIdx + 1] : process.env.DEMO_AUTH_EMAIL)?.trim().toLowerCase();
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!viewerEmail || !/^[^@\s]+@[^@\s]+$/.test(viewerEmail)) {
    console.error("Set DEMO_AUTH_EMAIL (or pass --viewer-email <email>) to the demo viewer address.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const client = await pool.connect();
  try {
    await runDemoTourSeed({ client, viewerEmail, cleanup, dryRun });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes("seed-demo-tour-fixtures")) {
  void main();
}
