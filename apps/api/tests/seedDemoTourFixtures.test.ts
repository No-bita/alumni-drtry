import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  runDemoTourSeed,
  FIXTURES,
  VIEWER_ID,
} from "../scripts/seed-demo-tour-fixtures.js";

describe("runDemoTourSeed", () => {
  const viewerEmail = "demo.alumni.guest@iitbhu.ac.in";
  let executedQueries: { sql: string; params?: any[] }[];
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
  };
  let silentLogger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    executedQueries = [];
    silentLogger = { log: vi.fn(), error: vi.fn() };
    mockClient = {
      query: vi.fn(async (sql: string, params?: any[]) => {
        executedQueries.push({ sql: sql.trim(), params });

        // Handler for checking existing demo people
        if (sql.includes("FROM people WHERE lower(institutional_email::text) = ANY")) {
          return { rows: [] };
        }

        // Handler for tracking seed-created organizations via demo_seed_organizations
        if (sql.includes("FROM demo_seed_organizations")) {
          return { rows: [] };
        }

        // Handlers for reference lookups
        if (sql.includes("FROM departments")) {
          return {
            rows: [
              { id: "dept-cse-id", code: "cse" },
              { id: "dept-ece-id", code: "ece" },
              { id: "dept-mech-id", code: "mech" },
              { id: "dept-eee-id", code: "eee" },
            ],
          };
        }
        if (sql.includes("FROM degrees")) {
          return {
            rows: [
              { id: "degree-btech-id", code: "btech" },
              { id: "degree-mtech-id", code: "mtech" },
            ],
          };
        }
        if (sql.includes("FROM occupation_types")) {
          return { rows: [{ id: "occ-full-time-id" }] };
        }

        // Handler for inserting organizations: return newly created ID for Razorpay, Swiggy, etc.
        if (sql.startsWith("INSERT INTO organizations")) {
          const name = params?.[0];
          return { rows: [{ id: `org-${name}-id` }] };
        }

        if (sql.includes("FROM organizations WHERE name = ANY")) {
          return {
            rows: Array.from(new Set(FIXTURES.map((f) => f.organization))).map((name) => ({
              id: `org-${name}-id`,
              name,
            })),
          };
        }

        // Delete queries returning rowCount
        if (sql.startsWith("DELETE FROM people")) {
          return { rowCount: 11 };
        }
        if (sql.startsWith("DELETE FROM organizations")) {
          return { rowCount: 3 };
        }
        if (sql.startsWith("DELETE FROM intentcasts")) {
          return { rowCount: 5 };
        }

        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it("seeds fixtures without mutating existing organizations and tracks new orgs in demo_seed_organizations", async () => {
    const res = await runDemoTourSeed({
      client: mockClient,
      viewerEmail,
      cleanup: false,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.seeded?.viewerEmail).toBe(viewerEmail);
    expect(res.seeded?.alumniCount).toBe(FIXTURES.length);

    // Verify transaction lifecycle
    expect(executedQueries[0].sql).toBe("BEGIN");
    expect(executedQueries[executedQueries.length - 1].sql).toBe("COMMIT");

    // Verify organization insert queries use ON CONFLICT (name) DO NOTHING RETURNING id
    const orgInsertQueries = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO organizations")
    );
    expect(orgInsertQueries.length).toBeGreaterThan(0);
    for (const q of orgInsertQueries) {
      expect(q.sql).toContain("ON CONFLICT (name) DO NOTHING");
      expect(q.sql).toContain("RETURNING id");
      expect(q.sql).not.toContain("DO UPDATE SET approval_status");
      expect(q.params).toContain(VIEWER_ID);
    }

    // Verify each created organization is tracked in demo_seed_organizations
    const trackingInsertQueries = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO demo_seed_organizations")
    );
    expect(trackingInsertQueries.length).toBe(orgInsertQueries.length);
    for (const q of trackingInsertQueries) {
      expect(q.sql).toContain("INSERT INTO demo_seed_organizations (organization_id)");
      expect(q.sql).toContain("ON CONFLICT DO NOTHING");
    }

    // Verify viewer is inserted before organizations so VIEWER_ID can be referenced
    const viewerInsertIndex = executedQueries.findIndex(
      (q) => q.sql.includes("INSERT INTO people") && q.params?.includes(VIEWER_ID)
    );
    const firstOrgInsertIndex = executedQueries.findIndex((q) =>
      q.sql.includes("INSERT INTO organizations")
    );
    expect(viewerInsertIndex).toBeGreaterThan(-1);
    expect(firstOrgInsertIndex).toBeGreaterThan(-1);
    expect(viewerInsertIndex).toBeLessThan(firstOrgInsertIndex);
  });

  it("rolls back when dryRun is true", async () => {
    await runDemoTourSeed({
      client: mockClient,
      viewerEmail,
      cleanup: false,
      dryRun: true,
      logger: silentLogger,
    });

    expect(executedQueries[executedQueries.length - 1].sql).toBe("ROLLBACK");
  });

  it("normalizes mixed-case viewerEmail in reusable runner (Finding 2)", async () => {
    const mixedCaseEmail = "Demo.Alumni.Guest@IITBHU.AC.IN";
    const res = await runDemoTourSeed({
      client: mockClient,
      viewerEmail: mixedCaseEmail,
      cleanup: false,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.seeded?.viewerEmail).toBe("demo.alumni.guest@iitbhu.ac.in");

    // Verify allEmails in query uses normalized email
    const peopleCheckQuery = executedQueries.find((q) =>
      q.sql.includes("FROM people WHERE lower(institutional_email::text) = ANY")
    );
    expect(peopleCheckQuery?.params?.[0]).toContain("demo.alumni.guest@iitbhu.ac.in");

    // Verify insertPerson uses normalized email
    const viewerInsertQuery = executedQueries.find(
      (q) => q.sql.includes("INSERT INTO people") && q.params?.includes(VIEWER_ID)
    );
    expect(viewerInsertQuery?.params?.[1]).toBe("demo.alumni.guest@iitbhu.ac.in");
  });

  it("tracks seed-created organizations via demo_seed_organizations and deletes only unreferenced ones during cleanup (Finding 1)", async () => {
    mockClient.query = vi.fn(async (sql: string, params?: any[]) => {
      executedQueries.push({ sql: sql.trim(), params });
      if (sql.includes("FROM people WHERE lower(institutional_email::text) = ANY")) {
        return {
          rows: [
            { id: VIEWER_ID, email: viewerEmail, role: "alumni", is_test_user: true, is_demo: true },
          ],
        };
      }
      // Return tracked organizations from demo_seed_organizations
      if (sql.includes("FROM demo_seed_organizations")) {
        return {
          rows: [
            { id: "org-seed-1" },
            { id: "org-seed-2" },
          ],
        };
      }
      if (sql.startsWith("DELETE FROM organizations")) {
        return { rowCount: 2 };
      }
      if (sql.startsWith("DELETE FROM people")) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await runDemoTourSeed({
      client: mockClient,
      viewerEmail,
      cleanup: true,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.removed.organizations).toBe(2);

    // Verify query selects from demo_seed_organizations without filtering by created_by_person_id or orgNames
    const orgFindQuery = executedQueries.find((q) =>
      q.sql.includes("FROM demo_seed_organizations")
    );
    expect(orgFindQuery?.sql).toBe("SELECT organization_id AS id FROM demo_seed_organizations");
    expect(orgFindQuery?.params).toBeUndefined();

    // Verify org deletion query checks that no occupations or canonical references exist
    const orgDeleteQuery = executedQueries.find((q) =>
      q.sql.startsWith("DELETE FROM organizations")
    );
    expect(orgDeleteQuery?.sql).toContain(
      "NOT EXISTS (\n               SELECT 1 FROM occupations WHERE occupations.organization_id = organizations.id\n             )"
    );
    expect(orgDeleteQuery?.sql).toContain(
      "NOT EXISTS (\n               SELECT 1 FROM organizations o2 WHERE o2.canonical_organization_id = organizations.id\n             )"
    );
    expect(orgDeleteQuery?.params).toEqual([["org-seed-1", "org-seed-2"]]);
  });

  it("does not insert into demo_seed_organizations for pre-existing organizations", async () => {
    // When organizations already exist, ON CONFLICT DO NOTHING RETURNING id returns no rows
    mockClient.query = vi.fn(async (sql: string, params?: any[]) => {
      executedQueries.push({ sql: sql.trim(), params });
      if (sql.includes("FROM departments")) {
        return {
          rows: [
            { id: "dept-cse-id", code: "cse" },
            { id: "dept-ece-id", code: "ece" },
            { id: "dept-mech-id", code: "mech" },
            { id: "dept-eee-id", code: "eee" },
          ],
        };
      }
      if (sql.includes("FROM degrees")) {
        return {
          rows: [
            { id: "degree-btech-id", code: "btech" },
            { id: "degree-mtech-id", code: "mtech" },
          ],
        };
      }
      if (sql.includes("FROM occupation_types")) {
        return { rows: [{ id: "occ-full-time-id" }] };
      }
      if (sql.startsWith("INSERT INTO organizations")) {
        // Pre-existing org: ON CONFLICT DO NOTHING returns empty rows
        return { rows: [] };
      }
      if (sql.includes("FROM organizations WHERE name = ANY")) {
        return {
          rows: Array.from(new Set(FIXTURES.map((f) => f.organization))).map((name, i) => ({
            id: `preexisting-org-${i}`,
            name,
          })),
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await runDemoTourSeed({
      client: mockClient,
      viewerEmail,
      cleanup: false,
      dryRun: false,
      logger: silentLogger,
    });

    // Since RETURNING id returned no rows, demo_seed_organizations was never inserted into
    const trackingInserts = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO demo_seed_organizations")
    );
    expect(trackingInserts.length).toBe(0);
  });

  it("seeding twice does not break when a seed org is still referenced (Finding 1.d)", async () => {
    // Simulate re-seeding when Razorpay is already tracked in demo_seed_organizations
    // but still referenced by another occupation.
    mockClient.query = vi.fn(async (sql: string, params?: any[]) => {
      executedQueries.push({ sql: sql.trim(), params });

      if (sql.includes("FROM demo_seed_organizations")) {
        return { rows: [{ id: "razorpay-id" }] };
      }
      if (sql.startsWith("DELETE FROM organizations")) {
        // Razorpay is still referenced, so DELETE returns 0 deleted rows
        return { rowCount: 0 };
      }
      if (sql.includes("FROM departments")) {
        return {
          rows: [
            { id: "dept-cse-id", code: "cse" },
            { id: "dept-ece-id", code: "ece" },
            { id: "dept-mech-id", code: "mech" },
            { id: "dept-eee-id", code: "eee" },
          ],
        };
      }
      if (sql.includes("FROM degrees")) {
        return {
          rows: [
            { id: "degree-btech-id", code: "btech" },
            { id: "degree-mtech-id", code: "mtech" },
          ],
        };
      }
      if (sql.includes("FROM occupation_types")) {
        return { rows: [{ id: "occ-full-time-id" }] };
      }
      if (sql.startsWith("INSERT INTO organizations")) {
        // Since Razorpay already exists in organizations, ON CONFLICT DO NOTHING returns no row
        return { rows: [] };
      }
      if (sql.includes("FROM organizations WHERE name = ANY")) {
        return {
          rows: Array.from(new Set(FIXTURES.map((f) => f.organization))).map((name) => ({
            id: `org-${name}-id`,
            name,
          })),
        };
      }

      return { rows: [], rowCount: 0 };
    });

    // Run re-seed (cleanup: false, which performs reset then seed)
    const res = await runDemoTourSeed({
      client: mockClient,
      viewerEmail,
      cleanup: false,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.removed.organizations).toBe(0);
    expect(res.seeded?.alumniCount).toBe(FIXTURES.length);

    // Because ON CONFLICT returned no row for the existing org, no duplicate insert occurred
    const trackingInserts = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO demo_seed_organizations")
    );
    expect(trackingInserts.length).toBe(0);
    expect(executedQueries[executedQueries.length - 1].sql).toBe("COMMIT");
  });
});
