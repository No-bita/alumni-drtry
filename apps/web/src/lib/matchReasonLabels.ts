/** Maps API `matchReasons` keys to short UI strings. */
export const MATCH_REASON_LABELS: Record<string, string> = {
  exact_name: "Name match",
  title_match: "Role match",
  keyword_match: "Keyword match",
  same_department: "Same department",
  graduating_batch: "Same batch",
  adjacent_batch: "Nearby batch",
  company_match: "Company match",
  occupation_type_match: "Occupation type"
};

export function matchReasonLabel(key: string): string {
  return MATCH_REASON_LABELS[key] ?? key.replace(/_/g, " ");
}
