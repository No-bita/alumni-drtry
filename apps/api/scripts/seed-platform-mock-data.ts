/**
 * Seed reusable mock data directly into the platform (no special mock URL needed).
 *
 * Usage (from apps/api, with DATABASE_URL in env):
 *   npx tsx scripts/seed-platform-mock-data.ts
 *   npx tsx scripts/seed-platform-mock-data.ts --count 6
 */
import "dotenv/config";
import pg from "pg";

/** Keep aligned with apps/web/src/constants/platformDemoPersonIds.ts (PLATFORM_DEMO_AUTHOR_IDS order = MOCK_PROFILES order). */
const PLATFORM_DEMO_AUTHOR_IDS = [
  "f4d90001-5026-4468-a111-aaaaaaaa0001",
  "f4d90002-5026-4468-a111-aaaaaaaa0002",
  "f4d90003-5026-4468-a111-aaaaaaaa0003",
  "f4d90004-5026-4468-a111-aaaaaaaa0004",
  "f4d90005-5026-4468-a111-aaaaaaaa0005",
  "f4d90006-5026-4468-a111-aaaaaaaa0006",
  "f4d90007-5026-4468-a111-aaaaaaaa0007",
  "f4d90008-5026-4468-a111-aaaaaaaa0008",
] as const;

type MockProfile = {
  name: string;
  deptCode: string;
  degreeCode: string;
  batchYear: number;
  roleTitle: string;
  organizationName: string;
  city: string;
  country: string;
  bio: string;
  skills: string;
  linkedin: string;
  github?: string;
};

const MOCK_PROFILES: MockProfile[] = [
  {
    name: "Rahul Sharma",
    deptCode: "cse",
    degreeCode: "btech",
    batchYear: 2021,
    roleTitle: "Backend Engineer",
    organizationName: "Razorpay",
    city: "Bangalore",
    country: "India",
    bio: "[DEMO] Building backend systems for payments infra.",
    skills: "Go, Distributed Systems, PostgreSQL",
    linkedin: "https://www.linkedin.com/in/demo-rahul-sharma/",
    github: "https://github.com/demo-rahul",
  },
  {
    name: "Sneha Gupta",
    deptCode: "cse",
    degreeCode: "btech",
    batchYear: 2020,
    roleTitle: "Senior Software Engineer",
    organizationName: "Razorpay",
    city: "Bangalore",
    country: "India",
    bio: "[DEMO] Working on scalable backend APIs and platform reliability.",
    skills: "Java, APIs, Kubernetes",
    linkedin: "https://www.linkedin.com/in/demo-sneha-gupta/",
    github: "https://github.com/demo-sneha",
  },
  {
    name: "Arjun Singh",
    deptCode: "cse",
    degreeCode: "btech",
    batchYear: 2022,
    roleTitle: "Backend Developer",
    organizationName: "Razorpay",
    city: "Bangalore",
    country: "India",
    bio: "[DEMO] Focused on services, observability, and platform tooling.",
    skills: "Node.js, TypeScript, Redis",
    linkedin: "https://www.linkedin.com/in/demo-arjun-singh/",
  },
  {
    name: "Vivek Tiwari",
    deptCode: "ece",
    degreeCode: "btech",
    batchYear: 2021,
    roleTitle: "Software Engineer",
    organizationName: "Razorpay",
    city: "Bangalore",
    country: "India",
    bio: "[DEMO] Shipping API and reliability improvements across services.",
    skills: "Python, APIs, Scalability",
    linkedin: "https://www.linkedin.com/in/demo-vivek-tiwari/",
  },
  {
    name: "Ananya Das",
    deptCode: "cse",
    degreeCode: "mtech",
    batchYear: 2019,
    roleTitle: "Product Engineer",
    organizationName: "Google",
    city: "Hyderabad",
    country: "India",
    bio: "[DEMO] Building internal tooling and user-facing workflow products.",
    skills: "React, Product Thinking, SQL",
    linkedin: "https://www.linkedin.com/in/demo-ananya-das/",
    github: "https://github.com/demo-ananya",
  },
  {
    name: "Karthik Menon",
    deptCode: "mec",
    degreeCode: "btech",
    batchYear: 2018,
    roleTitle: "Engineering Manager",
    organizationName: "Swiggy",
    city: "Bangalore",
    country: "India",
    bio: "[DEMO] Managing backend platform teams and architecture decisions.",
    skills: "Leadership, Backend Systems, Hiring",
    linkedin: "https://www.linkedin.com/in/demo-karthik-menon/",
  },
  {
    name: "Riya Nair",
    deptCode: "ece",
    degreeCode: "btech",
    batchYear: 2023,
    roleTitle: "Data Engineer",
    organizationName: "Microsoft",
    city: "Pune",
    country: "India",
    bio: "[DEMO] Building data pipelines and analytics systems.",
    skills: "Data Pipelines, Spark, SQL",
    linkedin: "https://www.linkedin.com/in/demo-riya-nair/",
    github: "https://github.com/demo-riya",
  },
  {
    name: "Devika Rao",
    deptCode: "eee",
    degreeCode: "mtech",
    batchYear: 2017,
    roleTitle: "Staff Engineer",
    organizationName: "Atlassian",
    city: "Remote",
    country: "India",
    bio: "[DEMO] Designing resilient platform primitives for internal teams.",
    skills: "System Design, Mentoring, Reliability",
    linkedin: "https://www.linkedin.com/in/demo-devika-rao/",
  },
];

function parseArgs(): { count: number } {
  const argv = process.argv.slice(2);
  let count = 8;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      count = Number.parseInt(argv[++i]!, 10);
    }
  }
  if (!Number.isFinite(count) || count < 1 || count > MOCK_PROFILES.length) {
    throw new Error(`Invalid --count. Use 1-${MOCK_PROFILES.length}.`);
  }
  return { count };
}

async function main() {
  const { count } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const selected = MOCK_PROFILES.slice(0, count);
  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const deptRows = await client.query<{ id: string; code: string }>(
      `SELECT id, lower(code) AS code FROM departments`
    );
    const degreeRows = await client.query<{ id: string; code: string }>(
      `SELECT id, lower(code) AS code FROM degrees WHERE is_active IS NOT FALSE`
    );
    const occType = await client.query<{ id: string }>(
      `SELECT id FROM occupation_types WHERE code = 'full_time_employment' LIMIT 1`
    );
    if (!occType.rows[0]) throw new Error("Missing occupation type full_time_employment.");

    const deptIdByCode = new Map(deptRows.rows.map((r) => [r.code, r.id]));
    const degreeIdByCode = new Map(degreeRows.rows.map((r) => [r.code, r.id]));

    await client.query(
      `
      DELETE FROM people
      WHERE is_test_user = TRUE
        AND lower(institutional_email::text) LIKE 'platformdemo.%@iitbhu.ac.in'
      `
    );

    const organizationNames = Array.from(new Set(selected.map((p) => p.organizationName.trim())));
    for (const orgName of organizationNames) {
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
      [organizationNames]
    );
    const orgIdByName = new Map(organizationRows.rows.map((r) => [r.name.toLowerCase(), r.id]));

    const seeded: string[] = [];
    const personIds: string[] = [];

    for (let i = 0; i < selected.length; i++) {
      const profile = selected[i]!;
      const deptId = deptIdByCode.get(profile.deptCode.toLowerCase());
      const degreeId = degreeIdByCode.get(profile.degreeCode.toLowerCase());
      const orgId = orgIdByName.get(profile.organizationName.toLowerCase());
      if (!deptId) throw new Error(`Missing department for code ${profile.deptCode}.`);
      if (!degreeId) throw new Error(`Missing degree for code ${profile.degreeCode}.`);
      if (!orgId) throw new Error(`Missing organization id for ${profile.organizationName}.`);

      const email = `platformdemo.${String(i + 1).padStart(2, "0")}@iitbhu.ac.in`;
      const mobile = `+919000000${String(100 + i).slice(-3)}`;
      const personId = PLATFORM_DEMO_AUTHOR_IDS[i]!;

      await client.query(
        `
        INSERT INTO people (
          id,
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
          mobile_phone,
          is_test_user,
          profile_completed_at,
          onboarding_completed_at,
          updated_at
        )
        VALUES (
          $1::uuid, $2, 'alumni', $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11,
          TRUE, now(), now(), now()
        )
        `,
        [
          personId,
          email,
          profile.name,
          deptId,
          degreeId,
          profile.batchYear,
          profile.bio,
          profile.skills,
          profile.city,
          profile.country,
          mobile,
        ]
      );
      personIds.push(personId);
      seeded.push(email);

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
          occType.rows[0]!.id,
          orgId,
          profile.roleTitle,
          "[DEMO] Seeded by seed-platform-mock-data script.",
        ]
      );

      await client.query(
        `
        INSERT INTO profile_links (person_id, platform, url, label, created_at, updated_at)
        VALUES
          ($1::uuid, 'linkedin', $2, 'LinkedIn', now(), now()),
          ($1::uuid, 'github', COALESCE($3, $2), 'GitHub', now(), now())
        `,
        [personId, profile.linkedin, profile.github ?? null]
      );
    }

    for (const personId of personIds.slice(0, 4)) {
      await client.query(
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
        VALUES (
          $1::uuid,
          '[DEMO] Hiring for backend + platform roles. Referrals welcome.',
          'hiring',
          'open',
          now() + interval '45 days',
          now() + interval '5 minutes',
          NULL,
          NULL,
          NULL,
          now(),
          now()
        )
        `,
        [personId]
      );
    }

    const requestSeeds = [
      {
        idx: 1,
        category: "mentorship",
        content:
          "[DEMO] Looking for mentorship on backend interview prep and systems design. 30-minute weekly slot works.",
      },
      {
        idx: 2,
        category: "guidance",
        content:
          "[DEMO] Moving to Bangalore next month. Need guidance on rental localities near HSR/Indiranagar and commute tips.",
      },
      {
        idx: 3,
        category: "collaboration",
        content:
          "[DEMO] Seeking collaborators for an alumni project on referral tracking dashboards. React + Node stack.",
      },
      {
        idx: 4,
        category: "guidance",
        content:
          "[DEMO] Relocating to Mumbai for a new role. Looking for temporary stay and neighborhood recommendations.",
      },
      {
        idx: 5,
        category: "mentorship",
        content:
          "[DEMO] Requesting product mentorship for PM transition from engineering. Open to fortnightly check-ins.",
      },
      {
        idx: 6,
        category: "guidance",
        content:
          "[DEMO] Moving to Hyderabad and need help with broker-free housing options and city onboarding essentials.",
      },
    ] as const;

    for (const seed of requestSeeds) {
      const authorId = personIds[seed.idx % personIds.length];
      if (!authorId) continue;
      await client.query(
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
        VALUES (
          $1::uuid,
          $2,
          $3,
          'open',
          now() + interval '30 days',
          now() + interval '5 minutes',
          NULL,
          NULL,
          NULL,
          now(),
          now()
        )
        `,
        [authorId, seed.content, seed.category]
      );
    }

    if (personIds.length >= 2) {
      const thread = await client.query<{ id: string }>(
        `
        INSERT INTO connection_threads (
          initiator_person_id,
          recipient_person_id,
          kind,
          status,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, $2::uuid, 'referral', 'open', now(), now())
        RETURNING id
        `,
        [personIds[0], personIds[1]]
      );
      await client.query(
        `
        INSERT INTO connection_messages (thread_id, author_person_id, body, created_at)
        VALUES
          ($1::uuid, $2::uuid, 'Hi, I found your profile and wanted to discuss a referral.', now()),
          ($1::uuid, $3::uuid, 'Sure, happy to help. Please share the role link.', now())
        `,
        [thread.rows[0]!.id, personIds[0], personIds[1]]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${seeded.length} platform mock profile(s):`);
    for (const email of seeded) console.log(`  - ${email}`);
    console.log(
      "Also seeded: occupations, links, hiring opportunities, mentorship/guidance/collaboration requests, city-moving requests, and one referral thread."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
