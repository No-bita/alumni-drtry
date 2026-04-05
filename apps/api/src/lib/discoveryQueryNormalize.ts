import { DIRECTORY_DEPARTMENT_CODES } from "../constants/departmentCodes.js";

/** Lowercase token → preferred company string for refine (hard filter: org name substring). */
const KNOWN_ORG_ALIASES: Record<string, string> = {
  google: "Google",
  alphabet: "Google",
  meta: "Meta",
  facebook: "Meta",
  microsoft: "Microsoft",
  msft: "Microsoft",
  amazon: "Amazon",
  aws: "Amazon",
  apple: "Apple",
  netflix: "Netflix",
  nvidia: "NVIDIA",
  adobe: "Adobe",
  oracle: "Oracle",
  salesforce: "Salesforce",
  ibm: "IBM",
  intel: "Intel",
  qualcomm: "Qualcomm",
  samsung: "Samsung",
  tcs: "TCS",
  infosys: "Infosys",
  wipro: "Wipro",
  accenture: "Accenture",
  mckinsey: "McKinsey",
  goldman: "Goldman Sachs",
  jpmorgan: "JPMorgan",
  stripe: "Stripe",
  uber: "Uber",
  linkedin: "LinkedIn"
};

export interface DiscoveryQueryNormalizeInput {
  q?: string;
  batch?: number;
  dept?: string;
  company?: string;
}

export interface DiscoveryQueryNormalizeResult {
  q?: string;
  batch?: number;
  dept?: string;
  company?: string;
  meta: {
    applied: boolean;
    batchFromQuery?: number;
    deptFromQuery?: string;
    companyFromQuery?: string;
    removedTokens: string[];
  };
}

function normalizeTokenKey(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * MVP: scan `q` for graduation year, department code tokens, and known employer aliases.
 * Only fills gaps when structured params are absent.
 */
export function normalizeDiscoveryQuery(input: DiscoveryQueryNormalizeInput): DiscoveryQueryNormalizeResult {
  const rawQ = input.q?.trim();
  if (!rawQ) {
    return {
      q: undefined,
      batch: input.batch,
      dept: input.dept,
      company: input.company,
      meta: { applied: false, removedTokens: [] }
    };
  }

  let batch = input.batch;
  let dept = input.dept;
  let company = input.company;
  const removedTokens: string[] = [];
  let tokens = rawQ.split(/\s+/).filter(Boolean);
  let applied = false;
  let batchFromQuery: number | undefined;
  let deptFromQuery: string | undefined;
  let companyFromQuery: string | undefined;
  const maxYear = new Date().getUTCFullYear() + 1;

  if (batch === undefined) {
    const yearTokens = tokens.filter((t) => /^(19|20)\d{2}$/.test(t));
    const parsedYears = [...new Set(yearTokens.map((t) => parseInt(t, 10)).filter((y) => y >= 1960 && y <= maxYear))];
    if (parsedYears.length === 1) {
      batch = parsedYears[0];
      batchFromQuery = batch;
      removedTokens.push(...yearTokens);
      tokens = tokens.filter((t) => !/^(19|20)\d{2}$/.test(t));
      applied = true;
    }
  }

  if (!dept) {
    const idx = tokens.findIndex((t) => DIRECTORY_DEPARTMENT_CODES.has(normalizeTokenKey(t)));
    if (idx >= 0) {
      const tok = tokens[idx];
      if (tok) {
        dept = normalizeTokenKey(tok);
        deptFromQuery = dept;
        removedTokens.push(tok);
        tokens = tokens.filter((_, j) => j !== idx);
        applied = true;
      }
    }
  }

  if (!company) {
    const idx = tokens.findIndex((t) => KNOWN_ORG_ALIASES[normalizeTokenKey(t)]);
    if (idx >= 0) {
      const tok = tokens[idx];
      if (tok) {
        const hint = KNOWN_ORG_ALIASES[normalizeTokenKey(tok)];
        if (hint) {
          company = hint;
          companyFromQuery = company;
          removedTokens.push(tok);
          tokens = tokens.filter((_, j) => j !== idx);
          applied = true;
        }
      }
    }
  }

  const qNext = tokens.join(" ").trim();
  const qOut = qNext.length > 0 ? qNext : undefined;

  return {
    q: qOut,
    batch,
    dept,
    company,
    meta: {
      applied,
      removedTokens,
      ...(batchFromQuery !== undefined ? { batchFromQuery } : {}),
      ...(deptFromQuery !== undefined ? { deptFromQuery } : {}),
      ...(companyFromQuery !== undefined ? { companyFromQuery } : {})
    }
  };
}
