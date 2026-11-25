/** Job functions (approved list): one tap on the profile and in hiring posts. Mirrors the API. */
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
  other: "Other",
};

/** Ask's role labels to their job function (mirrors the API's functionForRoleLabel). */
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
  "Strategy / Operations": "ops",
};

export function functionForRoleLabel(label: string | null | undefined): JobFunction | null {
  return label ? (ROLE_LABEL_FUNCTIONS[label.trim()] ?? null) : null;
}

export const EXPERIENCE_BANDS = ["intern", "0_3", "3_7", "7_plus"] as const;
export type ExperienceBand = (typeof EXPERIENCE_BANDS)[number];

export const EXPERIENCE_BAND_LABELS: Record<ExperienceBand, string> = {
  intern: "Intern",
  "0_3": "0–3 yrs",
  "3_7": "3–7 yrs",
  "7_plus": "7+ yrs",
};

export function isJobFunction(value: unknown): value is JobFunction {
  return typeof value === "string" && (JOB_FUNCTIONS as readonly string[]).includes(value);
}

/** Experience from the graduation year (same rule as the API): not graduated yet = Intern. */
export function experienceBandForBatchYear(batchYear: number | null | undefined, now: Date = new Date()): ExperienceBand | null {
  if (typeof batchYear !== "number" || !Number.isFinite(batchYear)) return null;
  const years = now.getUTCFullYear() - batchYear;
  if (years < 0) return "intern";
  if (years < 3) return "0_3";
  if (years < 7) return "3_7";
  return "7_plus";
}

/** "Hiring · Product · 3–7 yrs · Bengaluru · Acme": the card header built from the taps. */
export function hiringHeaderLine(h: {
  jobFunction: JobFunction;
  experience: ExperienceBand;
  location?: string | null;
  company?: string | null;
}): string {
  return ["Hiring", JOB_FUNCTION_LABELS[h.jobFunction], EXPERIENCE_BAND_LABELS[h.experience], h.location?.trim(), h.company?.trim()]
    .filter(Boolean)
    .join(" · ");
}
