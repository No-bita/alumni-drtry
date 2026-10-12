import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  runDemoTourSeed,
  FIXTURES,
  VIEWER_ID,
  ALL_DEMO_PERSON_IDS,
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

        // Handler for tracking seed-created organizations
        if (sql.includes("FROM organizations") && sql.includes("created_by_person_id = ANY")) {
          return { rows: [] };
        }

        // Handlers for reference lookups
        if (sql.includes("FROM departments")) {
          return { rows: [{ id: "dept-cse-id", code: "cse" }, { id: "dept-ece-id", code: "ece" }, { id: "dept-mech-id", code: "mech" }, { id: "dept-eee-id", code: "eee" }] };
        }
        if (sql.includes("FROM degrees")) {
          return { rows: [{ id: "degree-btech-id", code: "btech" }, { id: "degree-mtech-id", code: "mtech" }] };
        }
        if (sql.includes("FROM occupation_types")) {
          return { rows: [{ id: "occ-full-time-id" }] };
        }
        if (sql.includes("FROM organizations WHERE name = ANY")) {
          return {
            rows: Array.from(new Set(FIXTURES.map((f) => f.organization))).map((name, i) => ({
              id: `org-id-${i + 1}`,
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

  it("seeds fixtures without mutating existing organization approval status", async () => {
    const res = await runDemoTourSeed({
      client: mockClient as any,
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

    // Verify organization insert queries use ON CONFLICT DO NOTHING (not DO UPDATE SET approval_status = 'approved')
    const orgInsertQueries = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO organizations")
    );
    expect(orgInsertQueries.length).toBeGreaterThan(0);
    for (const q of orgInsertQueries) {
      expect(q.sql).toContain("ON CONFLICT (name) DO NOTHING");
      expect(q.sql).not.toContain("DO UPDATE SET approval_status");
      // Must attribute created_by_person_id to VIEWER_ID
      expect(q.params).toContain(VIEWER_ID);
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
      client: mockClient as any,
      viewerEmail,
      cleanup: false,
      dryRun: true,
      logger: silentLogger,
    });

    expect(executedQueries[executedQueries.length - 1].sql).toBe("ROLLBACK");
  });

  it("tracks seed-created organizations and deletes only unreferenced ones during cleanup", async () => {
    // Mock that Razorpay and Swiggy were created by VIEWER_ID
    mockClient.query = vi.fn(async (sql: string, params?: any[]) => {
      executedQueries.push({ sql: sql.trim(), params });
      if (sql.includes("FROM people WHERE lower(institutional_email::text) = ANY")) {
        return {
          rows: [
            { id: VIEWER_ID, email: viewerEmail, role: "alumni", is_test_user: true, is_demo: true },
          ],
        };
      }
      if (sql.includes("FROM organizations") && sql.includes("created_by_person_id = ANY")) {
        return {
          rows: [
            { id: "org-seed-1", name: "Razorpay" },
            { id: "org-seed-2", name: "Swiggy" },
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
      client: mockClient as any,
      viewerEmail,
      cleanup: true,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.removed.organizations).toBe(2);

    // Verify seed-created org query happened BEFORE people deletion
    const orgFindIndex = executedQueries.findIndex(
      (q) => q.sql.includes("FROM organizations") && q.sql.includes("created_by_person_id = ANY")
    );
    const peopleDeleteIndex = executedQueries.findIndex((q) =>
      q.sql.startsWith("DELETE FROM people")
    );
    const orgDeleteIndex = executedQueries.findIndex((q) =>
      q.sql.startsWith("DELETE FROM organizations")
    );

    expect(orgFindIndex).toBeGreaterThan(-1);
    expect(peopleDeleteIndex).toBeGreaterThan(-1);
    expect(orgDeleteIndex).toBeGreaterThan(-1);
    expect(orgFindIndex).toBeLessThan(peopleDeleteIndex);
    expect(peopleDeleteIndex).toBeLessThan(orgDeleteIndex);

    // Verify org deletion query checks that no occupations or canonical references exist
    const orgDeleteQuery = executedQueries[orgDeleteIndex];
    expect(orgDeleteQuery.sql).toContain("NOT EXISTS (\n               SELECT 1 FROM occupations WHERE occupations.organization_id = organizations.id\n             )");
    expect(orgDeleteQuery.sql).toContain("NOT EXISTS (\n               SELECT 1 FROM organizations o2 WHERE o2.canonical_organization_id = organizations.id\n             )");
    expect(orgDeleteQuery.params).toEqual([["org-seed-1", "org-seed-2"]]);
  });

  it("does not delete organizations that were not created by seed", async () => {
    // When no organizations were created by demo people
    mockClient.query = vi.fn(async (sql: string, params?: any[]) => {
      executedQueries.push({ sql: sql.trim(), params });
      if (sql.includes("FROM people WHERE lower(institutional_email::text) = ANY")) {
        return {
          rows: [
            { id: VIEWER_ID, email: viewerEmail, role: "alumni", is_test_user: true, is_demo: true },
          ],
        };
      }
      if (sql.includes("FROM organizations") && sql.includes("created_by_person_id = ANY")) {
        // Pre-existing orgs have created_by_person_id = NULL or another user ID, so query returns empty
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await runDemoTourSeed({
      client: mockClient as any,
      viewerEmail,
      cleanup: true,
      dryRun: false,
      logger: silentLogger,
    });

    expect(res.removed.organizations).toBe(0);

    // Verify DELETE FROM organizations was never called
    const orgDeleteQueries = executedQueries.filter((q) =>
      q.sql.startsWith("DELETE FROM organizations")
    );
    expect(orgDeleteQueries.length).toBe(0);
  });
});
