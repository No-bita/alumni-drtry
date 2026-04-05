import type { SearchProfileRow } from "../repos/discoveryRepo.js";

export interface MatchReasonContext {
  deptFilter?: string;
  batchCenter?: number;
  batchWidened: boolean;
  companySoft?: string;
  occSoft?: string;
  hasKeywordQ: boolean;
}

/** Stable machine keys; web maps to display strings. */
export function buildMatchReasonKeys(row: SearchProfileRow, ctx: MatchReasonContext): string[] {
  const keys: string[] = [];

  if (row.rank_tier === 0) keys.push("exact_name");
  else if (row.rank_tier === 1) keys.push("title_match");
  else if (ctx.hasKeywordQ) keys.push("keyword_match");

  if (ctx.deptFilter) {
    const code = (row.department_code ?? row.parsed_department_code ?? "").toLowerCase();
    if (code === ctx.deptFilter.toLowerCase()) keys.push("same_department");
  }

  if (ctx.batchCenter !== undefined && row.batch_year != null) {
    if (row.batch_year === ctx.batchCenter) keys.push("graduating_batch");
    else if (ctx.batchWidened && Math.abs(row.batch_year - ctx.batchCenter) === 1) keys.push("adjacent_batch");
  }

  if (ctx.companySoft && row.soft_company_match > 0) keys.push("company_match");
  if (ctx.occSoft && row.soft_occ_match > 0) keys.push("occupation_type_match");

  return keys;
}
