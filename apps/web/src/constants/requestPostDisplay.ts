/** Location hub “Active requests” posts — enforced in composer and card display */

export const LOCATION_REQUEST_TITLE_MAX_CHARS = 72;
export const LOCATION_REQUEST_DESCRIPTION_MAX_CHARS = 200;

export function capLocationRequestText(raw: string, maxChars: number): string {
  const s = raw.trim();
  if (maxChars <= 1) return s.length <= maxChars ? s : "…";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 1).trimEnd()}…`;
}
