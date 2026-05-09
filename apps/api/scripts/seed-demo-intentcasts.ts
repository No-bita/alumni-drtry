/**
 * Seed bulletin intentcasts for batch-demo alumni (`batchdemo.{dept}{year}.NN@iitbhu.ac.in`).
 *
 * Home “Active Requests” uses the global `GET /v1/intentcasts` feed (not city-scoped). Demo-authored rows
 * sort first when the signed-in viewer is also a demo/test profile (`is_test_user` or batchdemo/platformdemo email),
 * so they stay visible alongside normal ranking for production users.
 *
 * Local: put DATABASE_URL in apps/api/.env, then `npx tsx scripts/seed-demo-intentcasts.ts`.
 * Railway (Postgres service env): `railway run -s Postgres sh -c 'export DATABASE_URL="$DATABASE_PUBLIC_URL" && npx tsx scripts/seed-demo-intentcasts.ts'`
 */
import "dotenv/config";
import pg from "pg";

type IntentcastCategory = "hiring" | "mentorship" | "collaboration" | "guidance";

/** Distinct from profile bios; tied to intentcasts only for idempotent DELETE. */
const DEMO_BATCH_INTENTCAST_PREFIX = "[DEMO] batch bulletin seed — ";

function parseArgs(): { dept: string; year: number; maxAuthors: number | null } {
  const argv = process.argv.slice(2);
  let dept = "mst";
  let year = 2024;
  let maxAuthors: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dept" && argv[i + 1]) {
      dept = argv[++i]!.toLowerCase().trim();
    } else if (a === "--year" && argv[i + 1]) {
      year = parseInt(argv[++i]!, 10);
    } else if (a === "--max-authors" && argv[i + 1]) {
      maxAuthors = parseInt(argv[++i]!, 10);
    }
  }
  if (!Number.isFinite(year) || year < 1960 || year > new Date().getFullYear() + 1) {
    throw new Error(`Invalid --year ${year}`);
  }
  if (maxAuthors !== null && (!Number.isFinite(maxAuthors) || maxAuthors < 1)) {
    throw new Error(`Invalid --max-authors`);
  }
  return { dept, year, maxAuthors };
}

interface DemoPostDef {
  category: IntentcastCategory;
  /** Body including headline line for non-hiring categories. */
  bodyLines: string[];
}

const DEMO_POSTS: DemoPostDef[] = [
  {
    category: "hiring",
    bodyLines: [
      "NanoCeramics Pvt Ltd — Materials characterization intern (Hyderabad, onsite).",
      "Looking for someone comfortable with SEM/XRD workflows and Python scripting for batch reporting.",
      "Duration 10–12 weeks; stipend competitive. Alumni referrals welcome — reply here to connect.",
    ],
  },
  {
    category: "hiring",
    bodyLines: [
      "Graduate engineer opening — metallurgy / failure analysis (Pune).",
      "Team works with automotive suppliers on supplier quality and root-cause studies.",
      "If you have hands-on lab experience and documentation discipline, reach out via reply.",
    ],
  },
  {
    category: "mentorship",
    bodyLines: [
      "Mock interviews for manufacturing / ops roles",
      "Happy to run two 45-minute sessions per month on problem framing and STAR-style stories.",
      "Best fit if you are targeting plant engineering or supplier quality roles in India.",
    ],
  },
  {
    category: "mentorship",
    bodyLines: [
      "Guidance on MS applications (materials-adjacent programs)",
      "I went through US/EU apps recently and can review your shortlist, SoP outline, and timelines.",
      "Reply with your target intake term and rough profile.",
    ],
  },
  {
    category: "collaboration",
    bodyLines: [
      "Lightweight corrosion dataset for class project?",
      "Collecting anonymized field notes + lab tags for a bench-learning exercise (non-commercial).",
      "If your lab can share scrubbed parameters under a simple collaboration note, reply here.",
    ],
  },
  {
    category: "collaboration",
    bodyLines: [
      "Guest lecture slot — sustainable alloys narrative",
      "Looking for a co-speaker from industry for a 60-minute interactive session (virtual OK).",
      "Target audience: third-year UGs; reply if you have slides or caselets to contribute.",
    ],
  },
  {
    category: "guidance",
    bodyLines: [
      "Switching from core R&D to program management",
      "Sharing what helped me: stakeholder cadence, risk registers, and how to keep technical depth visible.",
      "Reply if you want a short reading list and checklist.",
    ],
  },
  {
    category: "guidance",
    bodyLines: [
      "Documentation habits that survived my first plant posting",
      "Templates for daily logs, handovers, and escalation notes — practical and boring but career-saving.",
      "Happy to compare notes with early-career folks.",
    ],
  },
];

function buildContent(def: DemoPostDef): string {
  const body = def.bodyLines.join("\n");
  return `${DEMO_BATCH_INTENTCAST_PREFIX}${body}`;
}

async function main(): Promise<void> {
  const { dept, year, maxAuthors } = parseArgs();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const emailLike = `batchdemo.${dept}${year}.%@iitbhu.ac.in`;

  const pool = new pg.Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const del = await client.query(
      `
      DELETE FROM intentcasts i
      USING people p
      WHERE i.author_person_id = p.id
        AND i.content LIKE $1
        AND lower(p.institutional_email::text) LIKE lower($2)
      `,
      [`${DEMO_BATCH_INTENTCAST_PREFIX}%`, emailLike]
    );
    console.log(`Removed ${del.rowCount ?? 0} prior demo intentcast row(s) for ${emailLike}.`);

    let authors = await client.query<{ id: string; institutional_email: string }>(
      `
      SELECT id, institutional_email::text AS institutional_email
      FROM people
      WHERE deleted_at IS NULL
        AND lower(institutional_email::text) LIKE lower($1)
      ORDER BY institutional_email::text ASC
      `,
      [emailLike]
    );

    if (authors.rows.length === 0) {
      console.warn(
        `No people matched ${emailLike}. Run scripts/seed-batch-demo-profiles.ts first or adjust --dept/--year.`
      );
      await client.query("ROLLBACK");
      process.exit(2);
    }

    let authorRows = authors.rows;
    if (maxAuthors !== null) {
      authorRows = authorRows.slice(0, maxAuthors);
    }

    let inserted = 0;
    const summary: { category: IntentcastCategory; author: string }[] = [];

    for (let i = 0; i < DEMO_POSTS.length; i++) {
      const post = DEMO_POSTS[i];
      if (!post) continue;
      const author = authorRows[i % authorRows.length]!;
      const content = buildContent(post);

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
          now() + interval '7 days',
          now() + interval '5 minutes',
          NULL,
          NULL,
          NULL,
          now(),
          now()
        )
        `,
        [author.id, content, post.category]
      );
      inserted++;
      summary.push({ category: post.category, author: author.institutional_email });
    }

    await client.query("COMMIT");

    const catCounts = summary.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `Inserted ${inserted} open intentcast(s) across categories: ${JSON.stringify(catCounts)} (author pool: ${authorRows.length}).`
    );
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
