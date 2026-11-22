/**
 * Test members marked complete need the identity onboarding requires (migration 073 refuses a
 * completed profile without a name, department, degree and graduation year).
 */
export const TEST_DEPARTMENT_ID_SQL = "(SELECT id FROM departments WHERE code = 'cse')";
export const TEST_DEGREE_ID_SQL = "(SELECT id FROM degrees WHERE code = 'btech')";
/** For an UPDATE … SET list (batch year is set separately where a test needs a specific one). */
export const TEST_IDENTITY_SET = `department_id = ${TEST_DEPARTMENT_ID_SQL}, degree_id = ${TEST_DEGREE_ID_SQL}`;
