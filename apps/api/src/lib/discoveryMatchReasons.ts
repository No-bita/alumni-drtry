import type { SearchProfileRow } from "../repos/discoveryRepo.js";

/** Normalize like discovery SQL: trim, lower, collapse internal whitespace. */
function normalizeSearchWhitespace(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * True when the keyword query clearly matches the person's display name (substring or all tokens),
 * even if SQL ranked the row as tier 2 (tier 0 is reserved for full-string name equality).
 */
export function queryMatchesProfileName(fullName: string | null | undefined, rawQuery: string | undefined): boolean {
  const q = normalizeSearchWhitespace(rawQuery ?? "");
  const name = normalizeSearchWhitespace(fullName ?? "");
  if (!q || !name) return false;
  if (name.includes(q)) return true;
  const tokens = q.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every((t) => name.includes(t));
}

export interface MatchReasonContext {
  deptFilter?: string;
  batchCenter?: number;
  batchWidened: boolean;
  companySoft?: string;
  occSoft?: string;
  hasKeywordQ: boolean;
  queryText?: string;
}

/** Stable machine keys; web maps to display strings. */
export function buildMatchReasonKeys(row: SearchProfileRow, ctx: MatchReasonContext): string[] {
  const keys: string[] = [];
  const pushUnique = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  if (row.rank_tier === 0) {
    pushUnique("exact_name");
  } else if (row.rank_tier === 1) {
    const q = ctx.queryText?.trim().toLowerCase() ?? "";
    const org = row.headline_organization_name?.trim().toLowerCase() ?? "";
    if (q && org && org.includes(q)) {
      pushUnique("company_match");
    } else {
      pushUnique("title_match");
    }
  } else if (ctx.hasKeywordQ) {
    if (queryMatchesProfileName(row.full_name, ctx.queryText)) {
      pushUnique("name_match");
    } else {
      pushUnique("keyword_match");
    }
  }

  if (ctx.deptFilter) {
    const code = (row.department_code ?? row.parsed_department_code ?? "").toLowerCase();
    if (code === ctx.deptFilter.toLowerCase()) pushUnique("same_department");
  }

  if (ctx.batchCenter !== undefined && row.batch_year != null) {
    if (row.batch_year === ctx.batchCenter) pushUnique("graduating_batch");
    else if (ctx.batchWidened && Math.abs(row.batch_year - ctx.batchCenter) === 1) pushUnique("adjacent_batch");
  }

  if (ctx.companySoft && row.soft_company_match > 0) pushUnique("company_match");
  if (ctx.occSoft && row.soft_occ_match > 0) pushUnique("occupation_type_match");

  return keys;
}
