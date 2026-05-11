/** Normalize user/admin-entered place alias for storage and lookup (lowercase, trimmed, collapsed spaces). */
export function normalizePlaceAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
