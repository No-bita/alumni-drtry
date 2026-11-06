import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { createApp } from "../src/app.js";
import { DepartmentOtherReviewRepo } from "../src/repos/departmentOtherReviewRepo.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
const run = Date.now();

/**
 * Real-Postgres checks for the Other-department decisions (approve, reject, link). Local test database
 * only. Each case uses its own freshly seeded member so nothing depends on other tests' order.
 *  1. A member edit that commits while a decision waits on the row lock wins: the decision applies
 *     nothing and writes no history.
 *  2. If the history insert fails, the status change rolls back with it. The failure is forced by a
 *     test-only trigger that fires only for a sentinel text; it is removed in `finally`.
 */
describe("department Other decisions: edit race and history failure (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let repo: DepartmentOtherReviewRepo;
  let adminId: string;
  let cseId: string;
  let seq = 0;

  type Decision = "approve" | "reject" | "link";
  const decide = (d: Decision, personId: string, text: string) =>
    d === "approve"
      ? repo.approve(personId, adminId, text)
      : d === "reject"
        ? repo.reject(personId, adminId, "Not a real department", text)
        : repo.link(personId, adminId, cseId, text);

  /** A fresh member in the Other department with `text` pending review. */
  const seedMember = async (text: string) => {
    const p = await loginForTest(app, `dor-int-${++seq}-${run}@iitbhu.ac.in`);
    await db.query(
      `UPDATE people
       SET department_id = (SELECT id FROM departments WHERE code = 'other'),
           department_other_text = $2, department_other_status = 'pending',
           department_other_rejection_reason = NULL, department_other_reviewed_by = NULL,
           department_other_reviewed_at = NULL
       WHERE id = $1`,
      [p.personId, text]
    );
    return p.personId;
  };
  const state = async (personId: string) =>
    (await db.query(
      `SELECT department_id, department_other_text, department_other_status,
              department_other_rejection_reason, department_other_reviewed_by, department_other_reviewed_at
       FROM people WHERE id = $1`,
      [personId]
    )).rows[0]!;
  const historyCount = async (personId: string) =>
    Number((await db.query(`SELECT count(*)::int AS n FROM department_other_history WHERE person_id = $1`, [personId])).rows[0]!.n);

  /** Wait until some backend is blocked on a row lock running one of our decision statements. */
  const waitUntilBlocked = async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const r = await db.query(
        `SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND query LIKE '%department_other_history%' LIMIT 1`
      );
      if (r.rowCount) return;
      await new Promise((res) => setTimeout(res, 25));
    }
    throw new Error("the decision statement never blocked on the member's row lock");
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    repo = new DepartmentOtherReviewRepo(db);
    const admin = await loginForTest(app, `dor-int-admin-${run}@iitbhu.ac.in`);
    adminId = admin.personId;
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [adminId]);
    cseId = (await db.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'cse'`)).rows[0]!.id;
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  for (const d of ["approve", "reject", "link"] as const) {
    it(`${d}: with no edit in between, the decision applies and writes one history row`, async () => {
      const personId = await seedMember(`Control ${d} ${run}`);
      expect(await decide(d, personId, `Control ${d} ${run}`)).toBe(true);
      expect(await historyCount(personId)).toBe(1);
      const s = await state(personId);
      expect(s.department_other_status).toBe(d === "reject" ? "rejected" : "approved");
    });

    it(`${d}: a member edit that commits first wins, so nothing is decided`, async () => {
      const reviewed = `Reviewed ${d} ${run}`;
      const edited = `Edited ${d} ${run}`;
      const personId = await seedMember(reviewed);
      const editor: PoolClient = await db.connect();
      let pending: Promise<boolean> | undefined;
      try {
        await editor.query("BEGIN");
        await editor.query(`UPDATE people SET department_other_text = $2, department_other_status = 'pending' WHERE id = $1`, [personId, edited]);
        pending = decide(d, personId, reviewed); // blocks on the row lock held by the editor
        await waitUntilBlocked();
        await editor.query("COMMIT");
        expect(await pending).toBe(false);
      } finally {
        // Never leave the lock held, even if an assertion above failed.
        await editor.query("ROLLBACK").catch(() => undefined);
        editor.release();
        await pending?.catch(() => undefined);
      }
      const s = await state(personId);
      expect(s.department_other_text).toBe(edited);
      expect(s.department_other_status).toBe("pending");
      expect(s.department_other_reviewed_by).toBeNull();
      expect(s.department_other_reviewed_at).toBeNull();
      expect(await historyCount(personId)).toBe(0);
    });
  }

  it("a failed history insert rolls the whole decision back (approve, reject, link)", async () => {
    const fn = `dor_test_fail_history_${run}`;
    const trg = `dor_test_fail_history_trg_${run}`;
    const sentinel = `FAIL-HISTORY-${run}`;
    try {
      // Test-only: fails history inserts for the sentinel text only, in this test database.
      await db.query(
        `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$
         BEGIN
           IF NEW.submitted_text = '${sentinel}' THEN RAISE EXCEPTION 'forced history failure'; END IF;
           RETURN NEW;
         END; $$ LANGUAGE plpgsql`
      );
      await db.query(`CREATE TRIGGER ${trg} BEFORE INSERT ON department_other_history FOR EACH ROW EXECUTE FUNCTION ${fn}()`);

      for (const d of ["approve", "reject", "link"] as const) {
        const personId = await seedMember(sentinel);
        const before = await state(personId);
        await expect(decide(d, personId, sentinel)).rejects.toThrow(/forced history failure/);
        expect(await state(personId)).toEqual(before); // status, reviewer, department all unchanged
        expect(before.department_other_status).toBe("pending");
        expect(await historyCount(personId)).toBe(0);
      }
    } finally {
      await db.query(`DROP TRIGGER IF EXISTS ${trg} ON department_other_history`);
      await db.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
});
