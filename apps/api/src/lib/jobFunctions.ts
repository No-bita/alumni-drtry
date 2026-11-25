/** Job functions (approved list): one tap on the profile and in hiring posts. */
export const JOB_FUNCTIONS = ["tech", "product", "design", "data", "sales", "marketing", "ops", "finance", "other"] as const;
export type JobFunction = (typeof JOB_FUNCTIONS)[number];

export const JOB_FUNCTION_LABELS: Record<JobFunction, string> = {
  tech: "Tech",
  product: "Product",
  design: "Design",
  data: "Data",
  sales: "Sales",
  marketing: "Marketing",
  ops: "Ops",
  finance: "Finance",
  other: "Other"
};

/**
 * Ask's role labels (lib/matchIntent ROLE_DEFINITIONS) to the job function they belong to, so a
 * hiring question for "Product Manager" finds alumni in Product. Roles with no single function
 * (Consultant, Research) map to none.
 */
const ROLE_LABEL_FUNCTIONS: Record<string, JobFunction> = {
  "Product Manager": "product",
  "Software Engineer": "tech",
  "Data Scientist": "data",
  "Data Analyst": "data",
  "Investment Banker": "finance",
  "Quant / Trader": "finance",
  Designer: "design",
  Marketing: "marketing",
  "Sales / BD": "sales",
  Finance: "finance",
  "Strategy / Operations": "ops"
};

export function functionForRoleLabel(label: string | null | undefined): JobFunction | null {
  return label ? (ROLE_LABEL_FUNCTIONS[label.trim()] ?? null) : null;
}

export function isJobFunction(value: unknown): value is JobFunction {
  return typeof value === "string" && (JOB_FUNCTIONS as readonly string[]).includes(value);
}

/** Experience levels used by hiring posts and matching. */
export const EXPERIENCE_BANDS = ["intern", "0_3", "3_7", "7_plus"] as const;
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number];

export const EXPERIENCE_BAND_LABELS: Record<ExperienceBand, string> = {
  intern: "Intern",
  "0_3": "0–3 yrs",
  "3_7": "3–7 yrs",
  "7_plus": "7+ yrs"
};

export function isExperienceBand(value: unknown): value is ExperienceBand {
  return typeof value === "string" && (EXPERIENCE_BANDS as readonly string[]).includes(value);
}

/**
 * Experience from the graduation year (approved for now; members will later be nudged to add a
 * résumé or correct dates). Not graduated yet = Intern; then years since graduation.
 */
export function experienceBandForBatchYear(batchYear: number | null | undefined, now: Date = new Date()): ExperienceBand | null {
  if (typeof batchYear !== "number" || !Number.isFinite(batchYear)) return null;
  const years = now.getUTCFullYear() - batchYear;
  if (years < 0) return "intern";
  if (years < 3) return "0_3";
  if (years < 7) return "3_7";
  return "7_plus";
}

/**
 * The same rule in SQL, for matching. `batchYearExpr` is a column such as `p.batch_year`.
 * NULL graduation year gives NULL (never matched).
 */
export function experienceBandSql(batchYearExpr: string): string {
  const years = `(EXTRACT(YEAR FROM now() AT TIME ZONE 'UTC')::int - ${batchYearExpr})`;
  return `(CASE WHEN ${batchYearExpr} IS NULL THEN NULL WHEN ${years} < 0 THEN 'intern' WHEN ${years} < 3 THEN '0_3' WHEN ${years} < 7 THEN '3_7' ELSE '7_plus' END)`;
}
